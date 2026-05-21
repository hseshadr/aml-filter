"""Main FastAPI application entry point."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from redis.asyncio import Redis

from aml_filter.api import create_app
from aml_filter.config import get_settings
from aml_filter.db.session import create_database

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[dict[str, Any] | None]:
    """Wire `app.state.db` and `app.state.redis_client` at startup; close on shutdown."""
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError(
            "DATABASE_URL environment variable is required. "
            "Example: postgresql+asyncpg://user:password@localhost:5432/amlfilter"
        )
    app.state.db = create_database(settings.database_url)
    try:
        app.state.redis_client = Redis.from_url(settings.redis_url, decode_responses=False)
    except Exception as exc:  # noqa: BLE001 — Redis is optional; never block app startup
        logger.warning("Redis unavailable; rate limiting disabled: %s", exc)
        app.state.redis_client = None

    yield None

    if app.state.redis_client is not None:
        await app.state.redis_client.close()


app = create_app(lifespan=lifespan)
