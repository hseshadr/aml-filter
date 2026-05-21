"""Main FastAPI application entry point."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from aml_filter.api import create_app
from aml_filter.api.dependencies import set_database
from aml_filter.config import get_settings
from aml_filter.db.session import create_database
from aml_filter.security.rate_limit import get_redis_client


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[dict[str, Any] | None]:  # noqa: ARG001 — FastAPI signature
    """Manage application lifecycle: startup and shutdown."""
    database_url = get_settings().database_url
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL environment variable is required. "
            "Example: postgresql+asyncpg://user:password@localhost:5432/amlfilter"
        )
    database = create_database(database_url)
    set_database(database)

    yield None  # Application runs here

    redis_client = get_redis_client()
    if redis_client:
        await redis_client.close()


app = create_app(lifespan=lifespan)
