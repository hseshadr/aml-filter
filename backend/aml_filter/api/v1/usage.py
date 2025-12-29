"""Usage metering API endpoints."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.api.dependencies import get_db_session
from aml_filter.security.middleware import require_api_key
from aml_filter.usage.service import get_usage_count, get_usage_summary

router = APIRouter(prefix="/usage", tags=["usage"])


class UsageSummaryResponse(BaseModel):
    """Response model for usage summary."""

    tenant_id: str
    period_start: str | None
    period_end: str | None
    event_type: str | None
    summary: dict[str, int]  # event_type -> total_units
    total_units: int


@router.get("", response_model=UsageSummaryResponse)
async def get_usage(
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
    start_date: str | None = Query(None, description="Start date (ISO format)"),
    end_date: str | None = Query(None, description="End date (ISO format)"),
    event_type: str | None = Query(None, description="Filter by event type"),
    days: int | None = Query(None, ge=1, description="Number of days to look back"),
) -> UsageSummaryResponse:
    """
    Get usage summary for the authenticated tenant.

    You can specify either:
    - `start_date` and `end_date` (ISO format)
    - `days` (number of days to look back from now)
    - `event_type` to filter by specific event type
    """
    # Parse dates
    end = None
    if end_date:
        end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
    elif days:
        end = datetime.now(UTC)

    start = None
    if start_date:
        start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
    elif days and end is not None:
        start = end - timedelta(days=days)

    # Get usage summary
    summary = await get_usage_summary(
        session=session,
        tenant_id=tenant_id,
        start_date=start,
        end_date=end,
        event_type=event_type,
    )

    # Get total
    total = await get_usage_count(
        session=session,
        tenant_id=tenant_id,
        start_date=start,
        end_date=end,
        event_type=event_type,
    )

    return UsageSummaryResponse(
        tenant_id=tenant_id,
        period_start=start.isoformat() if start else None,
        period_end=end.isoformat() if end else None,
        event_type=event_type,
        summary=summary,
        total_units=total,
    )

