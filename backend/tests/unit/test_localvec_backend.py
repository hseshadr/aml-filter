"""Unit tests for the edge-proc localvec-backed vector search backend.

These tests pin the ``vector_search`` contract that ``HybridSearchService``
consumes — identical semantics to the retired pgvector backend, but served from
edge-proc's in-memory FAISS index instead of a pgvector ANN. The FAISS work runs
fully in-process, so these are real (not mocked) end-to-end backend tests.
"""

from collections.abc import Iterator
from itertools import pairwise
from pathlib import Path

import pytest
from shared_libs_python import VectorEmbedding

from aml_filter.domain.search import SearchFilters
from aml_filter.search.localvec_backend import EntityVector, LocalVecBackend


def _vec(seed: float) -> list[float]:
    """A 384-dim L2-normalized vector pointing in a ``seed``-controlled direction.

    The encoder always L2-normalizes, so IndexFlatIP inner product equals cosine
    similarity and distance lands in ``[0, 2]``. ``seed`` rotates the vector: closeness
    to ``_vec(1.0)`` decreases as ``seed`` falls, giving a deterministic ranking
    (1.0 is an exact hit at distance 0) without needing a real model.
    """
    raw = [seed, 1.0 - seed, *([0.0] * 382)]
    norm = sum(v * v for v in raw) ** 0.5
    return [v / norm for v in raw]


@pytest.fixture
def populated_backend() -> Iterator[LocalVecBackend]:
    """A backend with three global SANCTION/PEP entities loaded into FAISS."""
    backend = LocalVecBackend()
    backend.build(
        [
            EntityVector("e_ofac", _vec(1.0), "OFAC_SDN", "SANCTION", "PERSON", None),
            EntityVector("e_eu", _vec(0.9), "EU", "PEP", "PERSON", None),
            EntityVector("e_org", _vec(0.8), "OFAC_SDN", "SANCTION", "ORGANIZATION", None),
        ]
    )
    yield backend


@pytest.mark.unit
class TestLocalVecVectorSearch:
    """The ``vector_search`` contract: (entity_id, distance) tuples, nearest first."""

    async def test_returns_distance_tuples_nearest_first(
        self, populated_backend: LocalVecBackend
    ) -> None:
        results = await populated_backend.vector_search(query_vector=_vec(1.0), k=3)
        assert [eid for eid, _ in results] == ["e_ofac", "e_eu", "e_org"]
        assert results[0][1] == pytest.approx(0.0, abs=1e-5)  # exact hit -> distance 0
        distances = [dist for _, dist in results]
        assert all(later >= earlier for earlier, later in pairwise(distances))

    async def test_empty_index_returns_empty(self) -> None:
        results = await LocalVecBackend().vector_search(query_vector=_vec(1.0), k=5)
        assert results == []

    async def test_respects_k_limit(self, populated_backend: LocalVecBackend) -> None:
        results = await populated_backend.vector_search(query_vector=_vec(1.0), k=1)
        assert len(results) == 1


@pytest.mark.unit
class TestLocalVecFiltering:
    """Filter + tenant semantics must match the pgvector backend exactly."""

    async def test_source_list_filter(self, populated_backend: LocalVecBackend) -> None:
        results = await populated_backend.vector_search(
            query_vector=_vec(1.0), k=3, filters=SearchFilters(source_lists=["EU"])
        )
        assert [eid for eid, _ in results] == ["e_eu"]

    async def test_risk_category_filter(self, populated_backend: LocalVecBackend) -> None:
        results = await populated_backend.vector_search(
            query_vector=_vec(1.0), k=3, filters=SearchFilters(risk_categories=["PEP"])
        )
        assert [eid for eid, _ in results] == ["e_eu"]

    async def test_entity_type_filter(self, populated_backend: LocalVecBackend) -> None:
        results = await populated_backend.vector_search(
            query_vector=_vec(1.0), k=3, filters=SearchFilters(entity_types=["ORGANIZATION"])
        )
        assert [eid for eid, _ in results] == ["e_org"]

    async def test_combined_filters_intersect(self, populated_backend: LocalVecBackend) -> None:
        results = await populated_backend.vector_search(
            query_vector=_vec(1.0),
            k=3,
            filters=SearchFilters(source_lists=["OFAC_SDN"], entity_types=["PERSON"]),
        )
        assert [eid for eid, _ in results] == ["e_ofac"]

    async def test_no_filters_returns_all(self, populated_backend: LocalVecBackend) -> None:
        results = await populated_backend.vector_search(query_vector=_vec(1.0), k=3)
        assert len(results) == 3


@pytest.mark.unit
class TestLocalVecTenantScope:
    """tenant_id=None -> global only; tenant_id=X -> tenant X plus global."""

    @pytest.fixture
    def tenant_backend(self) -> LocalVecBackend:
        backend = LocalVecBackend()
        backend.build(
            [
                EntityVector("g1", _vec(1.0), "OFAC_SDN", "SANCTION", "PERSON", None),
                EntityVector("t_acme", _vec(1.0), "CUSTOM", "CUSTOM", "PERSON", "acme"),
                EntityVector("t_other", _vec(1.0), "CUSTOM", "CUSTOM", "PERSON", "other"),
            ]
        )
        return backend

    async def test_none_tenant_sees_global_only(self, tenant_backend: LocalVecBackend) -> None:
        results = await tenant_backend.vector_search(query_vector=_vec(1.0), k=5, tenant_id=None)
        assert {eid for eid, _ in results} == {"g1"}

    async def test_tenant_sees_own_plus_global(self, tenant_backend: LocalVecBackend) -> None:
        results = await tenant_backend.vector_search(query_vector=_vec(1.0), k=5, tenant_id="acme")
        assert {eid for eid, _ in results} == {"g1", "t_acme"}


@pytest.mark.unit
class TestLocalVecPersistence:
    """save() then load() round-trips the index and its filter metadata."""

    async def test_save_then_load_preserves_search(
        self, populated_backend: LocalVecBackend, tmp_path: Path
    ) -> None:
        populated_backend.save(tmp_path)
        loaded = LocalVecBackend.load(tmp_path)
        results = await loaded.vector_search(
            query_vector=_vec(1.0), k=3, filters=SearchFilters(source_lists=["EU"])
        )
        assert [eid for eid, _ in results] == ["e_eu"]

    async def test_load_missing_dir_returns_empty_backend(self, tmp_path: Path) -> None:
        empty = LocalVecBackend.load(tmp_path / "does-not-exist")
        assert await empty.vector_search(query_vector=_vec(1.0), k=5) == []


@pytest.mark.unit
class TestLocalVecInsertContract:
    """insert_embeddings accepts shared-libs VectorEmbeddings (metadata-carried)."""

    async def test_insert_then_search(self) -> None:
        backend = LocalVecBackend()
        await backend.insert_embeddings(
            [
                VectorEmbedding(
                    entity_id="x",
                    embedding=_vec(1.0),
                    metadata={
                        "source_list": "OFAC_SDN",
                        "risk_category": "SANCTION",
                        "entity_type": "PERSON",
                    },
                )
            ]
        )
        results = await backend.vector_search(query_vector=_vec(1.0), k=1)
        assert results[0][0] == "x"
