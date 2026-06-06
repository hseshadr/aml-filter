"""Unit tests for the customer-side localvec index builder.

The delta-rescan path searches CHANGED sanctions entries against an index built over
CUSTOMERS (the inverse of the normal customer->list direction). This module builds that
index, reusing persisted entity embeddings and embedding only the ones that are missing.
"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import EntityEmbedding, Tenant
from aml_filter.embedding import EMBEDDING_DIM, EmbeddingService
from aml_filter.search.customer_index import CUSTOMER_SOURCE_LIST, build_customer_index
from tests.unit.conftest import FakeEmbeddingProvider

pytestmark = pytest.mark.unit


def _unit_vector(seed: int) -> list[float]:
    """A deterministic 384-dim unit vector (only one component set)."""
    vec = [0.0] * EMBEDDING_DIM
    vec[seed % EMBEDDING_DIM] = 1.0
    return vec


async def _add_tenant(session: AsyncSession, tenant_id: str) -> None:
    session.add(Tenant(tenant_id=tenant_id, name=tenant_id, plan="starter"))
    await session.commit()


async def _add_customer_entity(
    session: AsyncSession,
    entity_id: str,
    tenant_id: str,
    name: str,
    *,
    embedding: list[float] | None = None,
) -> None:
    """Insert a WHITELIST customer entity, optionally with a persisted embedding."""
    canonical = name.lower()
    session.add(
        DBEntity(
            entity_id=entity_id,
            tenant_id=tenant_id,
            entity_type="PERSON",
            primary_name=name,
            name_canonical=canonical,
            name_tokens=canonical.split(),
            name_trigram=canonical,
            aliases=[],
            risk_category="WHITELIST",
            source_list="CUSTOMERS",
            list_version="v1",
        )
    )
    if embedding is not None:
        session.add(
            EntityEmbedding(
                entity_id=entity_id,
                embedding=embedding,
                embedding_model="test",
                model_version="1",
            )
        )
    await session.commit()


def _service() -> EmbeddingService:
    return EmbeddingService(provider=FakeEmbeddingProvider(), enable_cache=False)


async def test_built_index_returns_nearest_customer(session: AsyncSession) -> None:
    await _add_tenant(session, "t1")
    near = _unit_vector(1)
    await _add_customer_entity(session, "cust-near", "t1", "Near Match", embedding=near)
    await _add_customer_entity(session, "cust-far", "t1", "Far One", embedding=_unit_vector(99))

    backend = await build_customer_index(session, tenant_id="t1", embedding_service=_service())
    hits = await backend.vector_search(near, k=1, tenant_id="t1")

    assert hits[0][0] == "cust-near"


async def test_customer_vectors_tagged_with_customers_source_list(
    session: AsyncSession,
) -> None:
    await _add_tenant(session, "t1")
    await _add_customer_entity(session, "c1", "t1", "Alice", embedding=_unit_vector(2))

    backend = await build_customer_index(session, tenant_id="t1", embedding_service=_service())
    hits = await backend.vector_search(
        _unit_vector(2),
        k=5,
        tenant_id="t1",
    )

    assert "c1" in {eid for eid, _ in hits}
    assert CUSTOMER_SOURCE_LIST == "CUSTOMERS"


async def test_missing_embeddings_are_computed(session: AsyncSession) -> None:
    """A customer with no persisted embedding is still indexed (embedded on the fly)."""
    await _add_tenant(session, "t1")
    await _add_customer_entity(session, "no-vec", "t1", "Needs Embedding", embedding=None)

    backend = await build_customer_index(session, tenant_id="t1", embedding_service=_service())
    expected = await _service().embed("needs embedding")
    hits = await backend.vector_search(expected, k=1, tenant_id="t1")

    assert hits and hits[0][0] == "no-vec"


async def test_other_tenant_customers_excluded(session: AsyncSession) -> None:
    await _add_tenant(session, "t1")
    await _add_tenant(session, "t2")
    await _add_customer_entity(session, "mine", "t1", "Mine", embedding=_unit_vector(3))
    await _add_customer_entity(session, "theirs", "t2", "Theirs", embedding=_unit_vector(3))

    backend = await build_customer_index(session, tenant_id="t1", embedding_service=_service())
    hits = await backend.vector_search(_unit_vector(3), k=10, tenant_id="t1")

    assert {eid for eid, _ in hits} == {"mine"}
