"""SAR API — generate, manage, and export Suspicious Activity Reports.

A SAR is created only for a customer who is a STRONG match to a sanctioned entity;
the STRONG gate is enforced in the engine and surfaced here as a 422. Reports are
jurisdiction-agnostic: ``jurisdiction`` + ``template`` select the renderer that
produces the fileable JSON/PDF export.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.api.dependencies import get_db_session
from aml_filter.db.models import Sar
from aml_filter.domain.sar import (
    Filer,
    SarJurisdiction,
    SarRecord,
    SarStatus,
    SarTemplate,
)
from aml_filter.sar.errors import SarGatingError, SarRenderError
from aml_filter.sar.registry import get_renderer
from aml_filter.sar.service import SarService
from aml_filter.security.middleware import require_api_key

router = APIRouter(prefix="/sars", tags=["sars"])


class SarCreateRequest(BaseModel):
    """Request body for creating a SAR from a customer's STRONG match."""

    customer_id: str = Field(..., min_length=1, max_length=36)
    match_id: str = Field(..., min_length=1, max_length=36)
    jurisdiction: SarJurisdiction = SarJurisdiction.US
    template: SarTemplate = SarTemplate.FINCEN
    narrative: str | None = Field(default=None, max_length=20000)
    filer: Filer
    created_by: str = Field(default="api", min_length=1, max_length=200)


class SarUpdateRequest(BaseModel):
    """Request body for editing a SAR's narrative/filer/status while editable."""

    narrative: str | None = Field(default=None, max_length=20000)
    filer: Filer | None = None
    status: SarStatus | None = None


def _to_record(sar: Sar) -> SarRecord:
    """Map a persisted SAR row to the typed API record (parses JSONB columns)."""
    return SarRecord.model_validate(sar)


def _require(sar: Sar | None, sar_id: str) -> Sar:
    """Return the SAR or raise 404 when not found/owned."""
    if sar is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"SAR {sar_id} not found")
    return sar


@router.post("", response_model=SarRecord, status_code=status.HTTP_201_CREATED)
async def create_sar(
    payload: SarCreateRequest,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> SarRecord:
    """Create a SAR for a STRONG match; fails closed (422) otherwise."""
    service = SarService(session=session)
    try:
        sar = await service.create(
            tenant_id=tenant_id,
            customer_id=payload.customer_id,
            match_id=payload.match_id,
            jurisdiction=payload.jurisdiction,
            template=payload.template,
            narrative=payload.narrative,
            filer=payload.filer,
            created_by=payload.created_by,
        )
    except SarGatingError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    return _to_record(sar)


@router.get("", response_model=list[SarRecord])
async def list_sars(
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
    status_filter: SarStatus | None = Query(default=None, alias="status"),
    customer_id: str | None = Query(default=None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> list[SarRecord]:
    """List the authenticated tenant's SARs (filterable, paginated)."""
    service = SarService(session=session)
    sars = await service.list(
        tenant_id=tenant_id,
        status=status_filter,
        customer_id=customer_id,
        limit=limit,
        offset=offset,
    )
    return [_to_record(sar) for sar in sars]


@router.get("/{sar_id}", response_model=SarRecord)
async def get_sar(
    sar_id: str,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> SarRecord:
    """Get a single SAR owned by the authenticated tenant."""
    service = SarService(session=session)
    sar = _require(await service.get(tenant_id, sar_id), sar_id)
    return _to_record(sar)


@router.put("/{sar_id}", response_model=SarRecord)
async def update_sar(
    sar_id: str,
    payload: SarUpdateRequest,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> SarRecord:
    """Edit a SAR's narrative/filer/status while it is DRAFT/COMPLETED."""
    service = SarService(session=session)
    sar = _require(await service.get(tenant_id, sar_id), sar_id)
    try:
        updated = await service.update(
            sar, narrative=payload.narrative, filer=payload.filer, status=payload.status
        )
    except SarGatingError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    return _to_record(updated)


@router.get("/{sar_id}/export")
async def export_sar(
    sar_id: str,
    export_format: str = Query("pdf", alias="format", pattern="^(pdf|json)$"),
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> Response:
    """Render the SAR to PDF or JSON, mark it EXPORTED, and stream the artifact."""
    service = SarService(session=session)
    sar = _require(await service.get(tenant_id, sar_id), sar_id)
    response = _render(_to_record(sar), export_format)
    await service.mark_exported(sar)
    return response


def _render(record: SarRecord, export_format: str) -> Response:
    """Render the SAR record into a typed HTTP response for the chosen format."""
    try:
        renderer = get_renderer(record.jurisdiction, record.template)
    except SarRenderError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if export_format == "json":
        return Response(content=renderer.render_json(record), media_type=renderer.content_type_json)
    body = renderer.render_pdf(record)
    headers = {"Content-Disposition": f'attachment; filename="sar-{record.sar_id}.pdf"'}
    return Response(content=body, media_type=renderer.content_type_pdf, headers=headers)
