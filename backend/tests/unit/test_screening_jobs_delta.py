"""Worker wiring tests: delta rescan when a prior ListVersion exists, full otherwise.

The worker (``screen_whitelist_on_blacklist_update``) uses the cheap delta path when a
previous version of the list exists (so it can diff), and falls back to the full rescan
for correctness when there is no prior version (first ingest) or delta is disabled.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import EntityEmbedding, ListVersion, Tenant, WhitelistBlacklistMatch
from aml_filter.embedding import EMBEDDING_DIM, EmbeddingService
from aml_filter.types import JsonObject
from aml_filter.worker import screening_jobs

pytestmark = pytest.mark.unit

_TENANT = "t-worker"
_DB_URL = "postgresql+asyncpg://test:test@localhost/test"


def _basis(canonical: str) -> list[float]:
    vec = [0.0] * EMBEDDING_DIM
    vec[abs(hash(canonical)) % EMBEDDING_DIM] = 1.0
    return vec


class _NameBasisProvider:
    model_name: str = "name-basis"
    dimension: int = EMBEDDING_DIM

    async def embed(self, text: str) -> list[float]:
        return _basis(text.strip().lower())

    async def embed_batch(self, texts: list[str], batch_size: int = 32) -> list[list[float]]:
        return [await self.embed(t) for t in texts]

    def get_model_info(self) -> dict[str, str | int]:
        return {"model_name": self.model_name, "dimension": self.dimension}


async def _seed_common(session: AsyncSession) -> None:
    from sqlalchemy import delete

    await session.execute(delete(ListVersion))
    await session.commit()
    session.add(Tenant(tenant_id=_TENANT, name=_TENANT, plan="starter"))
    await session.commit()
    await _add(session, "cust-1", "Vladimir Petrov", "WHITELIST", "CUSTOMERS", "v1", _TENANT)


async def _add(
    session: AsyncSession, eid: str, name: str, risk: str, sl: str, ver: str, tid: str | None
) -> None:
    c = name.lower()
    session.add(
        DBEntity(
            entity_id=eid,
            tenant_id=tid,
            entity_type="PERSON",
            primary_name=name,
            name_canonical=c,
            name_tokens=c.split(),
            name_trigram=c,
            aliases=[],
            risk_category=risk,
            source_list=sl,
            list_version=ver,
        )
    )
    session.add(
        EntityEmbedding(entity_id=eid, embedding=_basis(c), embedding_model="t", model_version="1")
    )
    await session.commit()


def _patch_session(session: AsyncSession):
    """Patch the worker's session opener to yield the test session (no commit/close)."""

    class _NoClose:
        async def __aenter__(self) -> AsyncSession:
            return session

        async def __aexit__(self, *exc: object) -> None:
            return None

    return patch.object(screening_jobs, "_open_session", lambda: _NoClose())


async def _match_keys(session: AsyncSession) -> set[tuple[str, str]]:
    result = await session.execute(
        select(WhitelistBlacklistMatch).where(WhitelistBlacklistMatch.tenant_id == _TENANT)
    )
    return {(m.whitelist_entity_id, m.blacklist_entity_id) for m in result.scalars().all()}


@patch.dict(os.environ, {"DATABASE_URL": _DB_URL})
async def test_worker_uses_delta_when_prior_version_exists(session: AsyncSession) -> None:
    await _seed_common(session)
    # Prior version v1 (so a diff is possible) and the new version v2 with a matching entry.
    now = datetime.now(UTC)
    session.add(
        ListVersion(
            list_id="OFAC_SDN",
            version="v1",
            status="ARCHIVED",
            ingested_at=now - timedelta(days=1),
        )
    )
    session.add(ListVersion(list_id="OFAC_SDN", version="v2", status="ACTIVE", ingested_at=now))
    await _add(session, "sanc-new", "Vladimir Petrov", "SANCTION", "OFAC_SDN", "v2", None)
    await session.commit()

    with _patch_session(session):
        result = await screen_via_worker()

    assert result["status"] == "completed"
    assert result["mode"] == "delta"
    assert ("cust-1", "sanc-new") in await _match_keys(session)


@patch.dict(os.environ, {"DATABASE_URL": _DB_URL})
async def test_worker_falls_back_to_full_when_no_prior_version(session: AsyncSession) -> None:
    await _seed_common(session)
    # Only one version exists -> no prior snapshot to diff against -> full rescan.
    session.add(
        ListVersion(
            list_id="OFAC_SDN", version="v1", status="ACTIVE", ingested_at=datetime.now(UTC)
        )
    )
    await _add(session, "sanc-1", "Vladimir Petrov", "SANCTION", "OFAC_SDN", "v1", None)
    await session.commit()

    with _patch_session(session):
        result = await screen_via_worker(list_version="v1")

    assert result["status"] == "completed"
    assert result["mode"] == "full"


# --- helpers that exercise the worker entrypoint with the test embedder -------------


def _embed_service() -> EmbeddingService:
    return EmbeddingService(provider=_NameBasisProvider(), enable_cache=False)


async def screen_via_worker(list_version: str = "v2") -> JsonObject:
    """Call the worker entrypoint with the deterministic test embedder injected."""
    with patch.object(screening_jobs, "_build_embedding_service", _embed_service):
        return await screening_jobs.screen_whitelist_on_blacklist_update(
            tenant_id=_TENANT, list_id="OFAC_SDN", list_version=list_version
        )
