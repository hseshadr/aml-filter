"""Shared async-session opener for worker (RQ) entry points.

Worker jobs run outside the FastAPI request lifecycle, so they open their own
session against the configured database. Fail-closed: a missing ``DATABASE_URL``
raises rather than silently no-op'ing.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.config import get_settings
from aml_filter.db.session import create_database


@asynccontextmanager
async def open_worker_session() -> AsyncIterator[AsyncSession]:
    """Yield an async session against the configured database (worker entrypoint)."""
    database_url = get_settings().database_url
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is required")
    database = create_database(database_url)
    async with database.async_session_maker() as session:
        yield session
