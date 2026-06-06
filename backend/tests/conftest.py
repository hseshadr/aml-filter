"""Pytest configuration and shared fixtures."""

import os
from collections.abc import AsyncGenerator

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from aml_filter.db.models import Base

pytest_plugins = ["pytest_asyncio"]


@pytest.fixture
def anyio_backend() -> str:
    """Use asyncio backend for anyio."""
    return "asyncio"


@pytest.fixture(scope="session")
def database_url() -> str:
    """Get database URL from environment or use default."""
    return os.getenv(
        "TEST_DATABASE_URL",
        "postgresql+asyncpg://amlfilter:amlfilter_dev_password@127.0.0.1:5435/amlfilter_test",
    )


from sqlalchemy.pool import NullPool


@pytest.fixture(scope="session")
async def engine(database_url: str):
    """Create session-wide database engine."""
    # Ensure test database exists
    admin_url = database_url.rsplit("/", 1)[0] + "/postgres"
    admin_engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT", poolclass=NullPool)
    db_name = database_url.rsplit("/", 1)[1]

    async with admin_engine.connect() as conn:
        await conn.execute(text(f"DROP DATABASE IF EXISTS {db_name}"))
        await conn.execute(text(f"CREATE DATABASE {db_name}"))
    await admin_engine.dispose()

    engine = create_async_engine(database_url, poolclass=NullPool)

    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        await conn.run_sync(Base.metadata.create_all)

    yield engine
    await engine.dispose()


@pytest.fixture
async def session(engine) -> AsyncGenerator[AsyncSession]:
    """Create a new database session for a test."""
    # Clean database using a separate connection to avoid session conflicts
    async with engine.begin() as conn:
        await conn.execute(text("TRUNCATE TABLE tenants CASCADE"))
        await conn.execute(text("TRUNCATE TABLE entities CASCADE"))
        await conn.execute(text("TRUNCATE TABLE scoring_policies CASCADE"))
        await conn.execute(text("TRUNCATE TABLE batch_jobs CASCADE"))
        await conn.execute(text("TRUNCATE TABLE search_requests CASCADE"))
        await conn.execute(text("TRUNCATE TABLE usage_meters CASCADE"))
        await conn.execute(text("TRUNCATE TABLE api_keys CASCADE"))
        await conn.execute(text("TRUNCATE TABLE whitelist_blacklist_matches CASCADE"))
        await conn.execute(text("TRUNCATE TABLE screening_jobs CASCADE"))
        await conn.execute(text("TRUNCATE TABLE customers CASCADE"))

    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as s:
        yield s
        await s.rollback()


from httpx import ASGITransport, AsyncClient

from aml_filter.api.main import app
from aml_filter.db.session import Database


@pytest.fixture
async def client(engine, database_url) -> AsyncGenerator[AsyncClient]:
    """Create a test client for the FastAPI app."""
    app.state.db = Database(database_url)
    app.state.redis_client = None
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture(scope="session")
def redis_url() -> str:
    """Get Redis URL from environment or use default."""
    return os.getenv("TEST_REDIS_URL", "redis://127.0.0.1:6380/0")
