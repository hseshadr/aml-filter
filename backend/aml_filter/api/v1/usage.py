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


def _parse_iso(value: str | None) -> datetime | None:
    """Parse an ISO date string (accepting a trailing Z), or None."""
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _resolve_end(end_date: str | None, days: int | None) -> datetime | None:
    """End of window: explicit ISO date, else 'now' when a look-back is given."""
    explicit = _parse_iso(end_date)
    if explicit is not None:
        return explicit
    return datetime.now(UTC) if days else None


def _resolve_window(
    start_date: str | None, end_date: str | None, days: int | None
) -> tuple[datetime | None, datetime | None]:
    """Resolve the (start, end) usage window from explicit ISO dates or a look-back `days`."""
    end = _resolve_end(end_date, days)
    start = _parse_iso(start_date)
    if start is None and days and end is not None:
        start = end - timedelta(days=days)
    return start, end


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
    start, end = _resolve_window(start_date, end_date, days)

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
