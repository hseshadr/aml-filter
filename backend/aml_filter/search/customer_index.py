"""Build a localvec index over a tenant's CUSTOMERS for delta-driven rescans.

Normal screening searches a customer against the sanctions list. The efficient
rescan inverts that: when a sanctions list changes, only the *changed* entries are
embedded and searched against an index built over the tenant's customers, so the
cost scales with the size of the list change, not the customer count.

This reuses the generic :class:`~aml_filter.search.localvec_backend.LocalVecBackend`
(edge-proc FAISS ``IndexFlatIP``) — no new index type. Customer entities are the
tenant's WHITELIST-side rows; their persisted ``EntityEmbedding`` vectors are reused
where present, and only the missing ones are embedded on the fly.
"""

from __future__ import annotations

from typing import Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.mapping import db_to_domain_entity
from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import EntityEmbedding
from aml_filter.domain.normalization import prepare_embedding_text
from aml_filter.embedding import EmbeddingService
from aml_filter.search.localvec_backend import (
    EntityVector,
    LocalVecBackend,
    entity_vector_to_embedding,
)

#: The synthetic ``source_list`` tag carried by every customer vector in this index.
CUSTOMER_SOURCE_LIST: Final[str] = "CUSTOMERS"


async def build_customer_index(
    session: AsyncSession,
    tenant_id: str,
    embedding_service: EmbeddingService,
) -> LocalVecBackend:
    """Build a localvec index over the tenant's customers (reusing stored embeddings)."""
    rows = await _load_customer_rows(session, tenant_id)
    backend = LocalVecBackend()
    vectors = [await _customer_vector(entity, vec, embedding_service) for entity, vec in rows]
    await backend.insert_embeddings([entity_vector_to_embedding(v) for v in vectors])
    return backend


async def _load_customer_rows(
    session: AsyncSession, tenant_id: str
) -> list[tuple[DBEntity, list[float] | None]]:
    """Load each (customer entity, persisted embedding-or-None) pair for the tenant."""
    result = await session.execute(
        select(DBEntity, EntityEmbedding.embedding)
        .outerjoin(EntityEmbedding, DBEntity.entity_id == EntityEmbedding.entity_id)
        .where(DBEntity.tenant_id == tenant_id, DBEntity.risk_category == "WHITELIST")
    )
    return [(entity, vec) for entity, vec in result.all()]


async def _customer_vector(
    entity: DBEntity, stored: list[float] | None, embedding_service: EmbeddingService
) -> EntityVector:
    """Build the EntityVector for one customer, embedding only when no vector is stored."""
    embedding = stored if stored is not None else await _embed_entity(entity, embedding_service)
    return EntityVector(
        entity_id=entity.entity_id,
        embedding=embedding,
        source_list=CUSTOMER_SOURCE_LIST,
        risk_category=entity.risk_category,
        entity_type=entity.entity_type,
        tenant_id=entity.tenant_id,
    )


async def _embed_entity(entity: DBEntity, embedding_service: EmbeddingService) -> list[float]:
    """Embed a customer entity's name (same text recipe the ingest path uses)."""
    domain = db_to_domain_entity(entity)
    country = domain.countries[0] if domain.countries else None
    return await embedding_service.embed(prepare_embedding_text(domain.primary_name, country))


__all__ = ["CUSTOMER_SOURCE_LIST", "build_customer_index"]
