"""List configuration API endpoints."""

import csv
import io
import json
import uuid
from typing import TypeGuard

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.api.dependencies import get_db_session
from aml_filter.db.models import Entity, EntityEmbedding, ListVersion, TenantListConfig
from aml_filter.domain.normalization import normalize_name, prepare_embedding_text
from aml_filter.embedding.service import EmbeddingService
from aml_filter.security.middleware import require_api_key
from aml_filter.types import JsonObject, JsonValue

router = APIRouter(prefix="/lists", tags=["lists"])


class ListConfigResponse(BaseModel):
    """Response model for list configuration."""

    model_config = ConfigDict(from_attributes=True)

    list_id: str
    enabled: bool
    version_override: str | None
    current_version: str | None
    updated_at: str


class ListConfigUpdate(BaseModel):
    """Request model for updating list configuration."""

    enabled: bool = Field(..., description="Enable or disable the list")
    version_override: str | None = Field(None, description="Override the default list version")


class CustomListUploadResponse(BaseModel):
    """Response model for custom list upload."""

    list_id: str
    status: str
    total_rows: int
    valid_rows: int
    errors: list[JsonObject] = []


def _parse_uploaded_list(
    content_str: str, filename: str
) -> tuple[list[JsonObject], list[JsonObject]]:
    """Parse a CSV or JSON upload into (entities, per-row errors). Raises HTTPException on bad shape."""
    if filename.endswith(".csv"):
        return _parse_csv_rows(content_str)
    if filename.endswith(".json"):
        return _parse_json_items(content_str)
    raise HTTPException(status_code=400, detail="Unsupported file format (CSV or JSON required)")


def _parse_csv_rows(content_str: str) -> tuple[list[JsonObject], list[JsonObject]]:
    """Parse CSV rows. Empty `name` cells are recorded as errors and skipped."""
    entities: list[JsonObject] = []
    errors: list[JsonObject] = []
    for i, row in enumerate(csv.DictReader(io.StringIO(content_str))):
        if not row.get("name"):
            errors.append({"row": i, "error": "Missing name"})
            continue
        entities.append(
            {
                "name": row["name"],
                "type": row.get("type", "PERSON"),
                "country": row.get("country"),
                "dob": row.get("dob"),
            }
        )
    return entities, errors


def _is_named_object(item: JsonValue) -> TypeGuard[JsonObject]:
    """True iff `item` is a JSON object carrying a non-empty `name`."""
    return isinstance(item, dict) and bool(item.get("name"))


def _load_json(content_str: str) -> list[JsonValue]:
    """Decode JSON content into a list of items (wrapping a lone object)."""
    try:
        data = json.loads(content_str)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON format") from exc
    return data if isinstance(data, list) else [data]


def _parse_json_items(content_str: str) -> tuple[list[JsonObject], list[JsonObject]]:
    """Parse JSON (array or single object). Items missing `name` are recorded as errors."""
    items = _load_json(content_str)
    entities = [item for item in items if _is_named_object(item)]
    errors: list[JsonObject] = [
        {"item": i, "error": "Missing name"}
        for i, item in enumerate(items)
        if not _is_named_object(item)
    ]
    return entities, errors


async def _persist_custom_entity(
    session: AsyncSession,
    embedding_service: EmbeddingService,
    item: JsonObject,
    *,
    list_id: str,
    list_name: str,
    version: str,
    tenant_id: str,
) -> None:
    """Add one (Entity, EntityEmbedding) pair to the session for a custom-list row."""
    name = str(item.get("name", ""))
    country = item.get("country")
    country_str = str(country) if country else None
    normalized = normalize_name(name)
    entity = Entity(
        entity_id=f"{list_id}:{uuid.uuid4()}",
        tenant_id=tenant_id,
        entity_type=str(item.get("type", "PERSON")).upper(),
        primary_name=name,
        name_canonical=normalized.name_canonical,
        name_tokens=normalized.name_tokens,
        name_trigram=normalized.name_trigram,
        countries=[country_str] if country_str else [],
        risk_category="CUSTOM",
        source_list=list_name,
        list_version=version,
        custom_list_id=list_id,
    )
    session.add(entity)
    vector = await embedding_service.embed(prepare_embedding_text(name, country_str))
    session.add(
        EntityEmbedding(
            entity_id=entity.entity_id,
            embedding=vector,
            embedding_model="sentence-transformers",
            model_version="default",
        )
    )


@router.post(
    "/custom/upload", response_model=CustomListUploadResponse, status_code=status.HTTP_201_CREATED
)
async def upload_custom_list(
    list_name: str = Query(..., min_length=1, max_length=200),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> CustomListUploadResponse:
    """Upload a custom list (CSV or JSON) — persists entities + embeddings + list activation."""
    content_str = (await file.read()).decode("utf-8")
    entities_to_create, errors = _parse_uploaded_list(content_str, file.filename or "")
    if not entities_to_create:
        raise HTTPException(status_code=400, detail="No valid entities found in file")

    list_id = f"custom:{tenant_id}:{uuid.uuid4().hex[:8]}"
    version = "v1"
    embedding_service = EmbeddingService()
    for item in entities_to_create:
        await _persist_custom_entity(
            session,
            embedding_service,
            item,
            list_id=list_id,
            list_name=list_name,
            version=version,
            tenant_id=tenant_id,
        )

    session.add(
        ListVersion(
            list_id=list_id,
            version=version,
            entity_count=len(entities_to_create),
            ingested_at=func.now(),
            activated_at=func.now(),
            status="ACTIVE",
        )
    )
    session.add(TenantListConfig(tenant_id=tenant_id, list_id=list_id, enabled=True))
    await session.commit()

    return CustomListUploadResponse(
        list_id=list_id,
        status="active",
        total_rows=len(entities_to_create) + len(errors),
        valid_rows=len(entities_to_create),
        errors=errors,
    )


@router.get("", response_model=list[ListConfigResponse])
async def list_tenant_lists(
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> list[ListConfigResponse]:
    """Get all list configurations for the authenticated tenant."""
    # Get tenant's list configs
    result = await session.execute(
        select(TenantListConfig).where(TenantListConfig.tenant_id == tenant_id)
    )
    configs = result.scalars().all()

    # Get current versions for each list
    list_ids = [config.list_id for config in configs]
    versions_result = await session.execute(
        select(ListVersion)
        .where(
            ListVersion.list_id.in_(list_ids),
            ListVersion.status == "ACTIVE",
        )
        .order_by(ListVersion.activated_at.desc())
    )
    versions = {v.list_id: v.version for v in versions_result.scalars().all()}

    return [
        ListConfigResponse(
            list_id=config.list_id,
            enabled=config.enabled,
            version_override=config.version_override,
            current_version=versions.get(config.list_id),
            updated_at=config.updated_at.isoformat(),
        )
        for config in configs
    ]


@router.get("/{list_id}", response_model=ListConfigResponse)
async def get_list_config(
    list_id: str,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> ListConfigResponse:
    """Get configuration for a specific list."""
    result = await session.execute(
        select(TenantListConfig).where(
            TenantListConfig.tenant_id == tenant_id,
            TenantListConfig.list_id == list_id,
        )
    )
    config = result.scalar_one_or_none()
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"List configuration for {list_id} not found",
        )

    # Get current version
    version_result = await session.execute(
        select(ListVersion)
        .where(
            ListVersion.list_id == list_id,
            ListVersion.status == "ACTIVE",
        )
        .order_by(ListVersion.activated_at.desc())
        .limit(1)
    )
    current_version = version_result.scalar_one_or_none()
    version = current_version.version if current_version else None

    return ListConfigResponse(
        list_id=config.list_id,
        enabled=config.enabled,
        version_override=config.version_override,
        current_version=version,
        updated_at=config.updated_at.isoformat(),
    )


@router.put("/{list_id}", response_model=ListConfigResponse)
async def update_list_config(
    list_id: str,
    config_update: ListConfigUpdate,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> ListConfigResponse:
    """Update configuration for a specific list."""
    # Get or create config
    result = await session.execute(
        select(TenantListConfig).where(
            TenantListConfig.tenant_id == tenant_id,
            TenantListConfig.list_id == list_id,
        )
    )
    config = result.scalar_one_or_none()

    if config is None:
        # Create new config
        config = TenantListConfig(
            tenant_id=tenant_id,
            list_id=list_id,
            enabled=config_update.enabled,
            version_override=config_update.version_override,
        )
        session.add(config)
    else:
        # Update existing
        config.enabled = config_update.enabled
        config.version_override = config_update.version_override

    await session.commit()
    await session.refresh(config)

    # Get current version
    version_result = await session.execute(
        select(ListVersion)
        .where(
            ListVersion.list_id == list_id,
            ListVersion.status == "ACTIVE",
        )
        .order_by(ListVersion.activated_at.desc())
        .limit(1)
    )
    current_version = version_result.scalar_one_or_none()
    version = current_version.version if current_version else None

    return ListConfigResponse(
        list_id=config.list_id,
        enabled=config.enabled,
        version_override=config.version_override,
        current_version=version,
        updated_at=config.updated_at.isoformat(),
    )
