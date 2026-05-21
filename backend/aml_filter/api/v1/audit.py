"""Audit API endpoints for search requests."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.api.dependencies import get_db_session
from aml_filter.db.models import SearchRequest
from aml_filter.security.middleware import require_api_key

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditRecordResponse(BaseModel):
    request_id: str
    tenant_id: str
    user_id: str | None
    request_hash: str
    query: dict[str, Any]
    policy_version: int | None
    list_versions_used: dict[str, str]
    matches: dict[str, Any]
    created_at: str
    execution_time_ms: int | None


class AuditListResponse(BaseModel):
    """Paginated list response for audit records."""

    total: int
    items: list[AuditRecordResponse]
    limit: int
    offset: int


def _normalize_matches(value: Any) -> dict[str, Any]:
    """Normalize stored matches payload to a consistent dict shape."""
    if isinstance(value, dict):
        return value
    if isinstance(value, list):
        return {"matches": value}
    return {"matches": []}


@router.get("/{request_id}", response_model=AuditRecordResponse)
async def get_audit_record(
    request_id: str,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> AuditRecordResponse:
    """Get a single audit record by request_id (tenant-scoped)."""
    result = await session.execute(
        select(SearchRequest).where(
            SearchRequest.request_id == request_id,
            SearchRequest.tenant_id == tenant_id,
        )
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audit record {request_id} not found",
        )

    return AuditRecordResponse(
        request_id=record.request_id,
        tenant_id=record.tenant_id,
        user_id=record.user_id,
        request_hash=record.request_hash,
        query=record.query,
        policy_version=record.policy_version,
        list_versions_used=record.list_versions_used,
        matches=_normalize_matches(record.matches),
        created_at=record.created_at.isoformat(),
        execution_time_ms=record.execution_time_ms,
    )


@router.get("", response_model=AuditListResponse)
async def list_audit_records(
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
    start_date: str | None = Query(None, description="Start date (ISO format)"),
    end_date: str | None = Query(None, description="End date (ISO format)"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> AuditListResponse:
    """List audit records for the tenant with optional date filtering."""
    count_stmt = (
        select(func.count()).select_from(SearchRequest).where(SearchRequest.tenant_id == tenant_id)
    )
    stmt = select(SearchRequest).where(SearchRequest.tenant_id == tenant_id)

    if start_date:
        start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
        count_stmt = count_stmt.where(SearchRequest.created_at >= start)
        stmt = stmt.where(SearchRequest.created_at >= start)
    if end_date:
        end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
        count_stmt = count_stmt.where(SearchRequest.created_at <= end)
        stmt = stmt.where(SearchRequest.created_at <= end)

    total_result = await session.execute(count_stmt)
    total = int(total_result.scalar() or 0)

    stmt = stmt.order_by(SearchRequest.created_at.desc()).limit(limit).offset(offset)
    result = await session.execute(stmt)
    records = result.scalars().all()

    items = [
        AuditRecordResponse(
            request_id=r.request_id,
            tenant_id=r.tenant_id,
            user_id=r.user_id,
            request_hash=r.request_hash,
            query=r.query,
            policy_version=r.policy_version,
            list_versions_used=r.list_versions_used,
            matches=_normalize_matches(r.matches),
            created_at=r.created_at.isoformat(),
            execution_time_ms=r.execution_time_ms,
        )
        for r in records
    ]

    return AuditListResponse(total=total, items=items, limit=limit, offset=offset)
