"""Main FastAPI application entry point."""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

try:
    from dotenv import find_dotenv, load_dotenv

    load_dotenv(find_dotenv(), override=False)
except Exception:
    # dotenv is optional; environment variables still work without it
    pass

from fastapi import FastAPI

from aml_filter.api import create_app
from aml_filter.api.dependencies import set_database
from aml_filter.db.session import create_database


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[dict[str, Any] | None]:
    """Manage application lifecycle: startup and shutdown."""
    # Startup
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL environment variable is required. "
            "Example: postgresql+asyncpg://user:password@localhost:5432/amlfilter"
        )
    database = create_database(database_url)
    set_database(database)

    yield None  # Application runs here

    # Shutdown
    from aml_filter.security.rate_limit import get_redis_client

    redis_client = get_redis_client()
    if redis_client:
        await redis_client.close()


app = create_app(lifespan=lifespan)

