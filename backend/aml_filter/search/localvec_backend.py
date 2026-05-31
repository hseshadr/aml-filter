"""Vector search backend served by edge-proc's localvec FAISS runtime.

This is the drop-in replacement for the pgvector ANN: it satisfies the same
``vector_search(query_vector, k, tenant_id, filters)`` contract that
``HybridSearchService`` consumes, but the nearest-neighbour work runs in-process
against edge-proc's :class:`~edgeproc.localvec.faiss_index.FaissVectorIndex`
(``IndexFlatIP`` + sentence-transformers space) instead of a Postgres index.

Filtering parity with pgvector is preserved by carrying each entity's filter
metadata (``source_list``, ``risk_category``, ``entity_type``, ``tenant_id``) on its
``VectorEmbedding``. aml keeps its OWN ``entity_id -> metadata`` side-map (built as
embeddings are inserted) and applies aml's list-IN and tenant-OR-global semantics in
Python over an over-fetched candidate set — it never reads edge-proc's private index
internals. Both the FAISS index and aml's side-map are persisted to a config-driven
directory so retrieval and filtering survive restarts.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final, TypeGuard

from edgeproc.localvec.faiss_index import FaissVectorIndex
from shared_libs_python import IndexConfig, VectorEmbedding
from shared_libs_python.vector_mgmt.core.types import Metadata, Scalar

from aml_filter.domain.search import SearchFilters
from aml_filter.embedding import EMBEDDING_DIM

_INDEX_NAME: Final[str] = "aml_entities"
_STATE_FILE: Final[str] = "state.json"  # FaissVectorIndex's on-disk sidecar marker
_META_FILE: Final[str] = "aml_meta.json"  # aml-owned filter-metadata side-map sidecar


@dataclass(frozen=True, slots=True)
class EntityVector:
    """One entity's embedding plus the metadata aml filters on."""

    entity_id: str
    embedding: list[float]
    source_list: str
    risk_category: str
    entity_type: str
    tenant_id: str | None


def entity_vector_to_embedding(item: EntityVector) -> VectorEmbedding:
    """Build a shared-libs VectorEmbedding carrying the filter metadata."""
    return VectorEmbedding(
        entity_id=item.entity_id,
        embedding=item.embedding,
        metadata=_metadata_of(item),
    )


def _metadata_of(item: EntityVector) -> dict[str, Scalar]:
    """The filter metadata for one entity (tenant_id omitted when global)."""
    meta: dict[str, Scalar] = {
        "source_list": item.source_list,
        "risk_category": item.risk_category,
        "entity_type": item.entity_type,
    }
    if item.tenant_id is not None:
        meta["tenant_id"] = item.tenant_id
    return meta


def _load_meta(directory: Path) -> dict[str, dict[str, Scalar]]:
    """Reload aml's filter side-map from its sidecar (empty when no sidecar exists)."""
    sidecar = directory / _META_FILE
    if not sidecar.is_file():
        return {}
    raw: object = json.loads(sidecar.read_text())
    return _coerce_meta(raw)


def _coerce_meta(raw: object) -> dict[str, dict[str, Scalar]]:
    """Narrow the parsed JSON object into the typed side-map shape."""
    if not isinstance(raw, dict):
        return {}
    return {str(eid): _coerce_row(row) for eid, row in raw.items()}


def _coerce_row(row: object) -> dict[str, Scalar]:
    """Keep only scalar-valued keys from one parsed metadata row."""
    if not isinstance(row, dict):
        return {}
    return {str(key): value for key, value in row.items() if _is_scalar(value)}


def _is_scalar(value: object) -> TypeGuard[Scalar]:
    """True for the JSON-representable scalar types aml stores as filter metadata."""
    return value is None or isinstance(value, (str, int, float, bool))


def _matches_list(meta: Metadata, key: str, allowed: Sequence[str] | None) -> bool:
    """True when no filter is set, or the entity's value is in the allowed list."""
    if not allowed:
        return True
    return meta.get(key) in allowed


def _matches_tenant(meta: Metadata, tenant_id: str | None) -> bool:
    """Global entities (no tenant_id) are always visible; tenant rows only to their tenant."""
    entity_tenant = meta.get("tenant_id")
    if entity_tenant is None:
        return True
    return entity_tenant == tenant_id


class LocalVecBackend:
    """Vector search over edge-proc's FAISS localvec index with aml filter parity."""

    def __init__(
        self,
        index: FaissVectorIndex | None = None,
        meta: dict[str, dict[str, Scalar]] | None = None,
    ) -> None:
        self._index = index or FaissVectorIndex(_INDEX_NAME, IndexConfig(dimension=EMBEDDING_DIM))
        # aml-owned filter side-map; never read from the edge-proc index internals.
        self._meta: dict[str, dict[str, Scalar]] = meta or {}

    def build(self, items: list[EntityVector]) -> None:
        """Populate the in-memory index from scratch (synchronous build helper)."""
        asyncio.run(self.insert_embeddings([entity_vector_to_embedding(item) for item in items]))

    async def insert_embeddings(self, embeddings: list[VectorEmbedding]) -> None:
        """Insert embeddings into FAISS and record their filter metadata in aml's side-map."""
        for embedding in embeddings:
            self._meta[embedding.entity_id] = dict(embedding.metadata)
        await self._index.insert(embeddings)

    async def vector_search(
        self,
        query_vector: list[float],
        k: int,
        tenant_id: str | None = None,
        filters: SearchFilters | None = None,
        ef_search: int | None = None,  # accepted for backend parity; flat index has no such knob
    ) -> list[tuple[str, float]]:
        """Nearest entities as (entity_id, distance), filtered to match pgvector semantics."""
        del ef_search
        hits = await self._index.search(query_vector, await self._fetch_size())
        kept = [hit for hit in hits if self._passes(hit[0], tenant_id, filters)]
        return kept[:k]

    async def _fetch_size(self) -> int:
        """Over-fetch the whole live set so post-filtering never starves the top-k."""
        return max((await self._index.get_stats()).vector_count, 1)

    def _passes(self, entity_id: str, tenant_id: str | None, filters: SearchFilters | None) -> bool:
        """Apply tenant scope and list filters against aml's own metadata side-map."""
        meta = self._meta.get(entity_id, {})
        return _matches_tenant(meta, tenant_id) and self._passes_filters(meta, filters)

    @staticmethod
    def _passes_filters(meta: Metadata, filters: SearchFilters | None) -> bool:
        """True when the entity satisfies every set source/risk/type filter."""
        if filters is None:
            return True
        return (
            _matches_list(meta, "source_list", filters.source_lists)
            and _matches_list(meta, "risk_category", filters.risk_categories)
            and _matches_list(meta, "entity_type", filters.entity_types)
        )

    def save(self, directory: Path) -> None:
        """Persist the FAISS index and aml's own filter side-map to ``directory``."""
        self._index.save(directory)
        (directory / _META_FILE).write_text(json.dumps(self._meta))

    @classmethod
    def load(cls, directory: Path) -> LocalVecBackend:
        """Load a saved index plus aml's side-map, or an empty backend when absent."""
        if not (directory / _STATE_FILE).is_file():
            return cls()
        return cls(FaissVectorIndex.load(_INDEX_NAME, directory), _load_meta(directory))
