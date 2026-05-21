"""List configuration API endpoints."""

import csv
import io
import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.api.dependencies import get_db_session
from aml_filter.db.models import Entity, EntityEmbedding, ListVersion, TenantListConfig
from aml_filter.domain.normalization import normalize_name, prepare_embedding_text
from aml_filter.embedding.service import EmbeddingService
from aml_filter.security.middleware import require_api_key

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
    errors: list[dict[str, Any]] = []


@router.post(
    "/custom/upload", response_model=CustomListUploadResponse, status_code=status.HTTP_201_CREATED
)
async def upload_custom_list(
    list_name: str = Query(..., min_length=1, max_length=200),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> CustomListUploadResponse:
    """Upload a custom list (CSV or JSON)."""
    # 1. Parse file
    content = await file.read()
    content_str = content.decode("utf-8")

    entities_to_create = []
    errors = []

    filename = file.filename or ""
    if filename.endswith(".csv"):
        reader = csv.DictReader(io.StringIO(content_str))
        for i, row in enumerate(reader):
            if not row.get("name"):
                errors.append({"row": i, "error": "Missing name"})
                continue
            entities_to_create.append(
                {
                    "name": row["name"],
                    "type": row.get("type", "PERSON"),
                    "country": row.get("country"),
                    "dob": row.get("dob"),
                }
            )
    elif filename.endswith(".json"):
        try:
            data = json.loads(content_str)
            if not isinstance(data, list):
                data = [data]
            for i, item in enumerate(data):
                if not item.get("name"):
                    errors.append({"item": i, "error": "Missing name"})
                    continue
                entities_to_create.append(item)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid JSON format") from exc
    else:
        raise HTTPException(
            status_code=400, detail="Unsupported file format (CSV or JSON required)"
        )

    if not entities_to_create:
        raise HTTPException(status_code=400, detail="No valid entities found in file")

    # 2. Process entities
    list_id = f"custom:{tenant_id}:{uuid.uuid4().hex[:8]}"
    version = "v1"

    embedding_service = EmbeddingService()

    for item in entities_to_create:
        name = str(item.get("name", ""))
        entity_type_str = str(item.get("type", "PERSON")).upper()
        country = item.get("country")
        country_str = str(country) if country else None

        normalized = normalize_name(name)
        entity = Entity(
            entity_id=f"{list_id}:{uuid.uuid4()}",
            tenant_id=tenant_id,
            entity_type=entity_type_str,
            primary_name=name,
            name_canonical=normalized["name_canonical"],
            name_tokens=normalized["name_tokens"],
            name_trigram=normalized["name_trigram"],
            countries=[country_str] if country_str else [],
            risk_category="CUSTOM",
            source_list=list_name,
            list_version=version,
            custom_list_id=list_id,
        )
        session.add(entity)

        # Generate and save embedding
        emb_text = prepare_embedding_text(name, country_str)
        vector = await embedding_service.embed(emb_text)

        embedding = EntityEmbedding(
            entity_id=entity.entity_id,
            embedding=vector,
            embedding_model="sentence-transformers",
            model_version="default",
        )
        session.add(embedding)

    # 3. Create ListVersion record
    lv = ListVersion(
        list_id=list_id,
        version=version,
        entity_count=len(entities_to_create),
        ingested_at=func.now(),
        activated_at=func.now(),
        status="ACTIVE",
    )
    session.add(lv)

    # 4. Enable list for tenant
    config = TenantListConfig(tenant_id=tenant_id, list_id=list_id, enabled=True)
    session.add(config)

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
