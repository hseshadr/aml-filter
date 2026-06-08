#!/usr/bin/env python3
"""Deterministic, idempotent seed for the KYC/AML end-to-end Playwright suite.

Brings a *live, migrated* database to the exact state the ``frontend/app``
``e2e-kyc`` Playwright suite needs to drive the full compliance journey in a real
browser. Running it twice produces the same state (idempotent), so the Playwright
``webServer`` can re-seed on every boot without drift.

What it seeds (all under one tenant):

* a **tenant** (``E2E_TENANT_ID``) and an **API key** whose plaintext is FIXED
  (``E2E_API_KEY``) so the browser can log in deterministically;
* a global **OFAC_SDN blacklist (sanctions) entity** — name ``E2E_SANCTIONED_NAME``
  — *with a real MiniLM embedding*, so that when the spec onboards a customer
  whose name is identical, the live screening pipeline retrieves it and records a
  genuine STRONG match (score ~1.0 >= the 0.80 STRONG floor). This is the
  "seeded blacklist entity + a strongly-matching customer" the journey hinges on;
* an **enabled OFAC_SDN list config** for the tenant (so the Lists page has an
  enabled, togglable list and the attestation snapshots a list/version);
* a deterministic **non-STRONG (POSSIBLE) seeded match** linked to a second
  onboarded customer (``E2E_WEAK_CUSTOMER_REF``), so the STRONG-gate negative
  ("a non-STRONG match offers no File SAR / the API rejects a SAR") is covered
  without depending on model scores.

The blacklist entity's match against the strongly-matching customer is produced
*by the app at onboarding time* (the spec drives it), not seeded here — so the
onboarding screening path is itself exercised end-to-end.

Run (against a migrated DB)::

    DATABASE_URL=postgresql+asyncpg://amlfilter:...@127.0.0.1:5436/amlfilter \\
        uv run python scripts/seed_e2e_kyc.py
"""

from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime

import bcrypt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from aml_filter.db.models import (
    ApiKey,
    Base,
    Customer,
    Entity,
    EntityEmbedding,
    ListVersion,
    Tenant,
    TenantListConfig,
    WhitelistBlacklistMatch,
)
from aml_filter.domain.normalization import normalize_name, prepare_embedding_text
from aml_filter.embedding.service import EmbeddingService


def _hash_api_key(plaintext: str) -> str:
    """Bcrypt-hash an API key (inlined from ``security.api_key`` to avoid importing
    the security package, whose ``__init__`` eagerly imports the API routers and
    triggers a circular import when this script runs standalone)."""
    return bcrypt.hashpw(plaintext.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


# --- Fixed identifiers the Playwright suite asserts against. ----------------
E2E_TENANT_ID = "e2e-kyc-tenant"
E2E_API_KEY = "aml_e2e_kyc_fixed_key_do_not_use_in_prod"
E2E_API_KEY_ID = "ak_e2e_kyc_fixed"
E2E_LIST_ID = "OFAC_SDN"
E2E_LIST_VERSION = "2026-06"

#: The sanctions name. The spec onboards a customer with this EXACT name to force
#: a STRONG match through the live screening pipeline.
E2E_SANCTIONED_NAME = "Vladimir Kuznetsov Sanctioned"
E2E_SANCTIONED_ENTITY_ID = "ofac:e2e:vladimir-kuznetsov"

#: A second, pre-onboarded customer + a deterministic POSSIBLE match. Used by the
#: STRONG-gate negative test: this row must NOT offer "File SAR".
E2E_WEAK_CUSTOMER_REF = "CUST-WEAK-001"
E2E_WEAK_CUSTOMER_ID = "e2e-weak-customer-0001"
E2E_WEAK_WL_ENTITY_ID = "whitelist:e2e-kyc-tenant:weakcustomer000"
E2E_WEAK_MATCH_ID = "e2e-weak-match-0001"
E2E_WEAK_SCORE = 0.55  # below the 0.80 STRONG floor -> POSSIBLE/WEAK, never STRONG


async def _ensure_schema(engine: object) -> None:
    """Create extensions + every table (idempotent), mirroring the test schema setup.

    The app's migrations are run via alembic in production; here we bring the schema
    up the same way the integration test suite does (``Base.metadata.create_all``),
    so the bootstrap does not depend on alembic's static ``sqlalchemy.url``. Both
    paths target the identical SQLAlchemy models.
    """
    async with engine.begin() as conn:  # type: ignore[attr-defined]
        for ext in ("vector", "pg_trgm", "btree_gin"):
            await conn.execute(text(f"CREATE EXTENSION IF NOT EXISTS {ext}"))
        await conn.run_sync(Base.metadata.create_all)


#: Tenant-scoped tables cleared before each seed, in FK-dependency order
#: (children first). The global sanctions entity (``tenant_id IS NULL``) and the
#: tenant/api-key/list-config rows are NOT cleared — they are re-asserted by the
#: idempotent upserts below.
_RESET_TABLES = ("sars", "attestations", "whitelist_blacklist_matches", "customers", "entities")


async def _reset_tenant_state(session: AsyncSession) -> None:
    """Delete this tenant's customers/matches/sars/attestations/entities.

    Makes the seed clean-idempotent: re-running it (as the Playwright webServer
    does on every boot) starts from a known-empty state instead of accumulating
    the app-created customers/matches the journey produces. Tenant-scoped, in one
    transaction, so other tenants' data is untouched.
    """
    for table in _RESET_TABLES:
        await session.execute(
            text(f"DELETE FROM {table} WHERE tenant_id = :tenant"),  # noqa: S608
            {"tenant": E2E_TENANT_ID},
        )
    await session.commit()


async def _upsert_tenant(session: AsyncSession) -> None:
    """Create the e2e tenant if absent."""
    existing = await session.get(Tenant, E2E_TENANT_ID)
    if existing is None:
        session.add(Tenant(tenant_id=E2E_TENANT_ID, name="E2E KYC Tenant", plan="enterprise"))
        await session.commit()


async def _upsert_api_key(session: AsyncSession) -> None:
    """Create the fixed-plaintext API key for the tenant if absent."""
    existing = await session.get(ApiKey, E2E_API_KEY_ID)
    if existing is None:
        session.add(
            ApiKey(
                key_id=E2E_API_KEY_ID,
                tenant_id=E2E_TENANT_ID,
                key_hash=_hash_api_key(E2E_API_KEY),
                name="e2e-kyc-fixed-key",
            )
        )
        await session.commit()


async def _upsert_sanctions_entity(session: AsyncSession, embedder: EmbeddingService) -> None:
    """Create the global OFAC_SDN sanctions entity (with embedding) if absent."""
    existing = await session.get(Entity, E2E_SANCTIONED_ENTITY_ID)
    if existing is not None:
        return
    normalized = normalize_name(E2E_SANCTIONED_NAME)
    session.add(
        Entity(
            entity_id=E2E_SANCTIONED_ENTITY_ID,
            tenant_id=None,  # global blacklist (shared across tenants)
            entity_type="PERSON",
            primary_name=E2E_SANCTIONED_NAME,
            name_canonical=normalized.name_canonical,
            name_tokens=normalized.name_tokens,
            name_trigram=normalized.name_trigram,
            risk_category="SANCTION",
            source_list=E2E_LIST_ID,
            list_version=E2E_LIST_VERSION,
        )
    )
    await session.flush()
    vector = await embedder.embed(prepare_embedding_text(E2E_SANCTIONED_NAME, None))
    session.add(
        EntityEmbedding(
            entity_id=E2E_SANCTIONED_ENTITY_ID,
            embedding=vector,
            embedding_model=str(embedder.get_model_info()["model_name"]),
            model_version="default",
        )
    )
    await session.commit()


async def _ensure_list_version(session: AsyncSession) -> None:
    """Record an ACTIVE OFAC_SDN list version so attestations can snapshot it."""
    existing = await session.get(ListVersion, (E2E_LIST_ID, E2E_LIST_VERSION))
    if existing is not None:
        return
    now = datetime.now(UTC)
    session.add(
        ListVersion(
            list_id=E2E_LIST_ID,
            version=E2E_LIST_VERSION,
            status="ACTIVE",
            ingested_at=now,
            activated_at=now,
        )
    )
    await session.commit()


async def _enable_list(session: AsyncSession) -> None:
    """Enable the OFAC_SDN list for the tenant if not already configured."""
    existing = await session.get(TenantListConfig, (E2E_TENANT_ID, E2E_LIST_ID))
    if existing is None:
        session.add(TenantListConfig(tenant_id=E2E_TENANT_ID, list_id=E2E_LIST_ID, enabled=True))
        await session.commit()


async def _seed_weak_customer_and_match(session: AsyncSession) -> None:
    """Seed a pre-onboarded customer + a deterministic POSSIBLE match (negative gate)."""
    if await session.get(WhitelistBlacklistMatch, E2E_WEAK_MATCH_ID) is not None:
        return
    normalized = normalize_name("Olivia Bystander")
    session.add(
        Entity(
            entity_id=E2E_WEAK_WL_ENTITY_ID,
            tenant_id=E2E_TENANT_ID,
            entity_type="PERSON",
            primary_name="Olivia Bystander",
            name_canonical=normalized.name_canonical,
            name_tokens=normalized.name_tokens,
            name_trigram=normalized.name_trigram,
            risk_category="WHITELIST",
            source_list="CUSTOMER_WHITELIST",
            list_version=E2E_LIST_VERSION,
        )
    )
    await session.flush()
    session.add(
        Customer(
            customer_id=E2E_WEAK_CUSTOMER_ID,
            tenant_id=E2E_TENANT_ID,
            customer_reference=E2E_WEAK_CUSTOMER_REF,
            onboarding_status="ACTIVE",
            onboarded_by="seed",
            screening_entity_id=E2E_WEAK_WL_ENTITY_ID,
        )
    )
    session.add(
        WhitelistBlacklistMatch(
            match_id=E2E_WEAK_MATCH_ID,
            tenant_id=E2E_TENANT_ID,
            whitelist_entity_id=E2E_WEAK_WL_ENTITY_ID,
            blacklist_entity_id=E2E_SANCTIONED_ENTITY_ID,
            match_score=E2E_WEAK_SCORE,
            match_type="WHITELIST_VS_BLACKLIST",
            match_tier="POSSIBLE",
            resolution_status="PENDING",
        )
    )
    await session.commit()


async def seed(database_url: str, embedder: EmbeddingService | None = None) -> None:
    """Apply every idempotent seed step against the given database.

    ``embedder`` is injectable so tests can pass a fast stub instead of loading
    the MiniLM model; production callers leave it unset and get the real one.
    """
    engine = create_async_engine(database_url, echo=False)
    await _ensure_schema(engine)
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    embedder = embedder or EmbeddingService()
    async with factory() as session:
        await _upsert_tenant(session)
        await _upsert_api_key(session)
        await _reset_tenant_state(session)
        await _upsert_sanctions_entity(session, embedder)
        await _ensure_list_version(session)
        await _enable_list(session)
        await _seed_weak_customer_and_match(session)
    await engine.dispose()
    print(f"✓ Seeded e2e-kyc state: tenant={E2E_TENANT_ID} list={E2E_LIST_ID}")
    print(f"  sanctioned entity: {E2E_SANCTIONED_NAME!r}")
    print(f"  fixed API key: {E2E_API_KEY}")


def main() -> None:
    """Resolve DATABASE_URL and run the seed."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required to seed the e2e-kyc database")
    asyncio.run(seed(database_url))


if __name__ == "__main__":
    main()
