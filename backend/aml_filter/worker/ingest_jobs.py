"""Background job for refreshing configured sanctions lists from their source URLs.

``refresh_all_enabled_lists`` is the RQ-callable (synchronous) entry point. It opens an
async DB session and drives :func:`refresh_enabled_lists`, which fetches + ingests every
enabled list that has a recorded ``source_url``.

Scheduling: register a periodic trigger with ``rq-scheduler`` (or any cron/systemd timer
that runs ``python -m aml_filter.worker.ingest_jobs``) — e.g. daily::

    from redis import Redis
    from rq_scheduler import Scheduler
    scheduler = Scheduler(queue_name="screening", connection=Redis.from_url(REDIS_URL))
    scheduler.cron(
        "0 3 * * *",  # 03:00 every day
        func="aml_filter.worker.ingest_jobs.refresh_all_enabled_lists",
    )

The cron expression and queue are config-driven; nothing here hard-codes a schedule.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.config import get_settings
from aml_filter.db.session import create_database
from aml_filter.ingest.downloader import refresh_enabled_lists

logger = logging.getLogger(__name__)


@asynccontextmanager
async def _open_session() -> AsyncIterator[AsyncSession]:
    """Open an async session against the configured database (worker entrypoint)."""
    database_url = get_settings().database_url
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is required")
    database = create_database(database_url)
    async with database.async_session_maker() as session:
        yield session


async def _refresh_all_lists() -> dict[str, int]:
    """Refresh every enabled list within a fresh session; return a pass/fail summary."""
    async with _open_session() as session:
        outcomes = await refresh_enabled_lists(session)
    refreshed = sum(1 for outcome in outcomes if outcome.ok)
    return {"refreshed": refreshed, "failed": len(outcomes) - refreshed}


def refresh_all_enabled_lists() -> dict[str, int]:
    """Synchronous RQ entry point: refresh all enabled sanctions lists."""
    summary = asyncio.run(_refresh_all_lists())
    logger.info("List refresh complete: %s", summary)
    return summary


if __name__ == "__main__":
    refresh_all_enabled_lists()
