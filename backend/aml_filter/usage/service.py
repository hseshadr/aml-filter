"""Usage metering service."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import UsageMeter


async def record_usage(
    session: AsyncSession,
    tenant_id: str,
    event_type: str,
    units: int = 1,
    request_id: str | None = None,
    job_id: str | None = None,
) -> UsageMeter:
    """
    Record a usage event.

    Args:
        session: Database session
        tenant_id: The tenant ID
        event_type: Event type (e.g., "screen", "batch", "api_call")
        units: Number of units consumed (default: 1)
        request_id: Optional request ID
        job_id: Optional job ID

    Returns:
        The created UsageMeter record
    """
    usage = UsageMeter(
        tenant_id=tenant_id,
        event_type=event_type,
        units=units,
        request_id=request_id,
        job_id=job_id,
    )
    session.add(usage)
    await session.commit()
    await session.refresh(usage)
    return usage


async def get_usage_summary(
    session: AsyncSession,
    tenant_id: str,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    event_type: str | None = None,
) -> dict[str, int]:
    """
    Get usage summary for a tenant.

    Args:
        session: Database session
        tenant_id: The tenant ID
        start_date: Optional start date filter
        end_date: Optional end date filter
        event_type: Optional event type filter

    Returns:
        Dictionary with event_type -> total_units
    """
    query = select(
        UsageMeter.event_type,
        func.sum(UsageMeter.units).label("total_units"),
    ).where(UsageMeter.tenant_id == tenant_id)

    if start_date:
        query = query.where(UsageMeter.created_at >= start_date)
    if end_date:
        query = query.where(UsageMeter.created_at <= end_date)
    if event_type:
        query = query.where(UsageMeter.event_type == event_type)

    query = query.group_by(UsageMeter.event_type)

    result = await session.execute(query)
    rows = result.all()

    return {row.event_type: int(row.total_units) for row in rows}


async def get_usage_count(
    session: AsyncSession,
    tenant_id: str,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    event_type: str | None = None,
) -> int:
    """
    Get total usage count for a tenant.

    Args:
        session: Database session
        tenant_id: The tenant ID
        start_date: Optional start date filter
        end_date: Optional end date filter
        event_type: Optional event type filter

    Returns:
        Total number of units consumed
    """
    query = select(func.sum(UsageMeter.units)).where(UsageMeter.tenant_id == tenant_id)

    if start_date:
        query = query.where(UsageMeter.created_at >= start_date)
    if end_date:
        query = query.where(UsageMeter.created_at <= end_date)
    if event_type:
        query = query.where(UsageMeter.event_type == event_type)

    result = await session.execute(query)
    total = result.scalar() or 0
    return int(total)

