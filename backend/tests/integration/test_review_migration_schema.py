"""Regression guard: review API against a *migration-built* schema.

The rest of the integration suite builds its schema from ``Base.metadata.create_all``
(the ORM), which silently hides any drift between the Alembic migrations and the ORM
models. This module instead stands up a dedicated database via ``alembic upgrade heads``
and exercises ``GET /v1/review/matches`` against it, so a migration-vs-model type drift
(e.g. ``match_id`` declared ``String(36)`` in the ORM but created as ``uuid`` in the
migration) is caught as a real 500 rather than masked.
"""

import os
from collections.abc import AsyncGenerator

import pytest
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from aml_filter.api.main import app
from aml_filter.db.models import ApiKey, Entity, Tenant, WhitelistBlacklistMatch
from aml_filter.db.session import Database
from aml_filter.scoring.tiers import MatchTier
from aml_filter.security.api_key import hash_api_key

_MIGRATED_DB = "amlfilter_migrated_test"


def _base_url() -> str:
    """Base test DB URL (without the database name)."""
    full = os.getenv(
        "TEST_DATABASE_URL",
        "postgresql+asyncpg://amlfilter:amlfilter_dev_password@127.0.0.1:5435/amlfilter_test",
    )
    return full.rsplit("/", 1)[0]


def _migrated_url() -> str:
    """Async URL for the migration-built database."""
    return f"{_base_url()}/{_MIGRATED_DB}"


async def _recreate_database() -> None:
    """Drop and recreate the migration-built database with required extensions."""
    admin = create_async_engine(
        f"{_base_url()}/postgres", isolation_level="AUTOCOMMIT", poolclass=NullPool
    )
    async with admin.connect() as conn:
        await conn.execute(text(f"DROP DATABASE IF EXISTS {_MIGRATED_DB}"))
        await conn.execute(text(f"CREATE DATABASE {_MIGRATED_DB}"))
    await admin.dispose()
    seed = create_async_engine(_migrated_url(), poolclass=NullPool)
    async with seed.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
    await seed.dispose()


def _upgrade_to_head() -> None:
    """Bring the migration-built database to head via Alembic (NOT create_all)."""
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", _migrated_url())
    command.upgrade(cfg, "heads")


async def _run_migrations() -> None:
    """Run Alembic in a worker thread.

    ``alembic/env.py`` calls ``asyncio.run()``, which cannot run inside the
    pytest-asyncio event loop, so we offload it to a thread with its own loop.
    """
    import asyncio

    await asyncio.to_thread(_upgrade_to_head)


@pytest.fixture(scope="module")
async def migrated_engine():
    """Session engine bound to a schema built by Alembic migrations."""
    await _recreate_database()
    await _run_migrations()
    engine = create_async_engine(_migrated_url(), poolclass=NullPool)
    yield engine
    await engine.dispose()


@pytest.fixture
async def migrated_client(migrated_engine) -> AsyncGenerator[AsyncClient]:
    """Test client wired to the migration-built database."""
    app.state.db = Database(_migrated_url())
    app.state.redis_client = None
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def migrated_session(migrated_engine) -> AsyncGenerator[AsyncSession]:
    """Clean session over the migration-built schema (truncate like the shared conftest)."""
    async with migrated_engine.begin() as conn:
        await conn.execute(text("TRUNCATE TABLE tenants CASCADE"))
        await conn.execute(text("TRUNCATE TABLE entities CASCADE"))
        await conn.execute(text("TRUNCATE TABLE whitelist_blacklist_matches CASCADE"))
    maker = async_sessionmaker(migrated_engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
        await s.rollback()


async def _seed(session: AsyncSession) -> str:
    """Seed a tenant, API key, two entities and a match; return the match_id."""
    import uuid

    tenant_id = "migrated-tenant"
    session.add(Tenant(tenant_id=tenant_id, name="Migrated", plan="starter"))
    await session.flush()
    session.add(
        ApiKey(
            key_id="migrated-key",
            tenant_id=tenant_id,
            key_hash=hash_api_key("aml_migrated_key"),
            name="migrated",
        )
    )
    wl_id, bl_id = f"wl-{uuid.uuid4()}", f"bl-{uuid.uuid4()}"
    session.add_all(
        [
            Entity(
                entity_id=wl_id,
                tenant_id=tenant_id,
                entity_type="PERSON",
                primary_name="Jon Q Customer",
                name_canonical="jon q customer",
                name_trigram="jon q customer",
                risk_category="WHITELIST",
                source_list="CUSTOMER",
                list_version="v1",
            ),
            Entity(
                entity_id=bl_id,
                tenant_id=None,
                entity_type="PERSON",
                primary_name="John Quincy Sanctioned",
                name_canonical="john quincy sanctioned",
                name_trigram="john quincy sanctioned",
                risk_category="SANCTION",
                source_list="OFAC_SDN",
                list_version="2026-06",
            ),
        ]
    )
    await session.flush()
    match_id = str(uuid.uuid4())
    session.add(
        WhitelistBlacklistMatch(
            match_id=match_id,
            tenant_id=tenant_id,
            whitelist_entity_id=wl_id,
            blacklist_entity_id=bl_id,
            match_score=0.92,
            match_type="WHITELIST_VS_BLACKLIST",
            match_tier=MatchTier.STRONG.value,
            resolution_status="PENDING",
        )
    )
    await session.commit()
    return match_id


@pytest.mark.integration
class TestReviewMatchesMigratedSchema:
    """GET /v1/review/matches against an Alembic-migrated schema."""

    @pytest.mark.asyncio
    async def test_returns_200_with_string_match_id(self, migrated_client, migrated_session):
        match_id = await _seed(migrated_session)
        resp = await migrated_client.get(
            "/v1/review/matches", headers={"X-API-Key": "aml_migrated_key"}
        )
        assert resp.status_code == 200, resp.text
        rows = resp.json()
        assert len(rows) == 1
        returned = rows[0]["match_id"]
        assert isinstance(returned, str)
        assert returned == match_id
