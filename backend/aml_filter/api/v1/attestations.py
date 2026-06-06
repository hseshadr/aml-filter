"""Attestations API — generate, list, verify, and export screening review badges.

An attestation is a verifiable record that a customer was screened against the
enabled lists at known versions on a date, with a result. ``POST`` generates/refreshes
one; ``GET`` lists the latest per customer (with a ``stale`` filter for due-for-review);
``/verify`` checks the ed25519 signature against the pinned bundle trust-root public
key; ``/export`` renders a JSON or PDF badge. All endpoints are X-API-Key + tenant-scoped.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.api.dependencies import get_db_session
from aml_filter.attestation import renderer
from aml_filter.attestation.config import load_signing_config
from aml_filter.attestation.service import AttestationService
from aml_filter.attestation.signing import VerificationResult, verify_payload
from aml_filter.config import get_settings
from aml_filter.db.models import Attestation
from aml_filter.domain.attestation import (
    AttestationRecord,
    AttestationStatus,
    ListVersionEntry,
    ResultSummary,
)
from aml_filter.security.middleware import require_api_key

router = APIRouter(prefix="/attestations", tags=["attestations"])


class AttestationCreateRequest(BaseModel):
    """Request body for generating/refreshing a customer's attestation."""

    customer_id: str = Field(..., min_length=1, max_length=36)
    require_signature: bool = False


def _to_record(row: Attestation) -> AttestationRecord:
    """Map a persisted attestation row (flat columns) to the typed API record."""
    return AttestationRecord(
        attestation_id=row.attestation_id,
        tenant_id=row.tenant_id,
        customer_id=row.customer_id,
        customer_reference=row.customer_reference,
        screened_at=row.screened_at,
        valid_until=row.valid_until,
        lists_and_versions=[ListVersionEntry.model_validate(e) for e in row.lists_and_versions],
        result=ResultSummary(
            status=AttestationStatus(row.status),
            match_count=row.match_count,
            pending_count=row.pending_count,
        ),
        signature=row.signature,
        signing_key_id=row.signing_key_id,
        algo=row.algo,
        created_at=row.created_at,
    )


def _require(row: Attestation | None, attestation_id: str) -> Attestation:
    """Return the attestation or raise 404 when not found/owned."""
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attestation {attestation_id} not found",
        )
    return row


def _load_public_key() -> bytes:
    """Load the pinned ed25519 public key (the bundle trust root) for verification."""
    key_path = get_settings().verify_key_path
    if key_path is None or not key_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No verification key is configured (VERIFY_KEY_PATH unset)",
        )
    return key_path.read_bytes()


def _service(session: AsyncSession) -> AttestationService:
    """Build the service with the (optional) configured signing key."""
    return AttestationService(session=session, signing_config=load_signing_config(get_settings()))


@router.post("", response_model=AttestationRecord, status_code=status.HTTP_201_CREATED)
async def generate_attestation(
    payload: AttestationCreateRequest,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> AttestationRecord:
    """Generate/refresh an attestation for a customer (fail-closed on missing key)."""
    try:
        row = await _service(session).build_for_customer(
            tenant_id, payload.customer_id, require_signature=payload.require_signature
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    return _to_record(row)


@router.get("", response_model=list[AttestationRecord])
async def list_attestations(
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
    customer_id: str | None = Query(default=None),
    stale: bool | None = Query(default=None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> list[AttestationRecord]:
    """List the latest attestation per customer (filterable, paginated)."""
    rows = await _service(session).list_latest(
        tenant_id, customer_id=customer_id, stale=stale, limit=limit, offset=offset
    )
    return [_to_record(row) for row in rows]


@router.get("/{attestation_id}", response_model=AttestationRecord)
async def get_attestation(
    attestation_id: str,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> AttestationRecord:
    """Get a single attestation owned by the authenticated tenant."""
    row = _require(await _service(session).get(tenant_id, attestation_id), attestation_id)
    return _to_record(row)


@router.get("/{attestation_id}/verify", response_model=VerificationResult)
async def verify_attestation(
    attestation_id: str,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> VerificationResult:
    """Verify the attestation's signature against the pinned trust-root public key."""
    service = _service(session)
    row = _require(await service.get(tenant_id, attestation_id), attestation_id)
    payload = service.payload_of(row)
    return verify_payload(payload, row.signature, _load_public_key())


@router.get("/{attestation_id}/export")
async def export_attestation(
    attestation_id: str,
    export_format: str = Query("pdf", alias="format", pattern="^(pdf|json)$"),
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> Response:
    """Render the attestation badge to PDF or JSON and stream the artifact."""
    row = _require(await _service(session).get(tenant_id, attestation_id), attestation_id)
    return _render(_to_record(row), export_format)


def _render(record: AttestationRecord, export_format: str) -> Response:
    """Render the attestation record into a typed HTTP response for the format."""
    if export_format == "json":
        return Response(content=renderer.render_json(record), media_type=renderer.content_type_json)
    body = renderer.render_pdf(record)
    headers = {
        "Content-Disposition": f'attachment; filename="attestation-{record.attestation_id}.pdf"'
    }
    return Response(content=body, media_type=renderer.content_type_pdf, headers=headers)
