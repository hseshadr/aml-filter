"""Bundle-backed screening: screen a name against a synced bundle, no Postgres."""

from __future__ import annotations

from pathlib import Path

import pytest

from aml_filter.bundle.screening import BundleScreeningSource
from aml_filter.bundle.sync import SyncedBundle
from aml_filter.domain.entity import Entity
from aml_filter.domain.search import SearchQuery
from aml_filter.search.localvec_backend import EntityVector, LocalVecBackend
from tests.unit.bundle.conftest import make_vec


@pytest.fixture
def synced(sample_entities: list[Entity], sample_vectors: list[EntityVector]) -> SyncedBundle:
    """An in-memory SyncedBundle (skips publish/sync; tests the screening path directly)."""
    from aml_filter.bundle.meta import OfacBundleMeta

    backend = LocalVecBackend()
    backend.build(sample_vectors)
    meta = OfacBundleMeta(
        list_id="OFAC_SDN",
        version="2026-05-30",
        entity_count=len(sample_entities),
        embedding_model="sentence-transformers/all-MiniLM-L6-v2",
        embedding_dim=384,
    )
    return SyncedBundle(meta=meta, entities=sample_entities, vector_backend=backend)


@pytest.mark.unit
class TestBundleScreeningSource:
    """Screening against a synced bundle returns SearchResponse with list versions."""

    async def test_exact_vector_hit_matches(self, synced: SyncedBundle) -> None:
        source = BundleScreeningSource(synced)
        response = await source.screen(
            SearchQuery(name="Vladimir Ivanov", threshold=0.0, k=5),
            query_vector=make_vec(1.0),
        )
        assert response.matches[0].entity_id == "e_ofac"

    async def test_list_versions_used_reports_bundle_version(self, synced: SyncedBundle) -> None:
        source = BundleScreeningSource(synced)
        response = await source.screen(
            SearchQuery(name="Vladimir Ivanov", threshold=0.0, k=5),
            query_vector=make_vec(1.0),
        )
        assert response.list_versions_used == {"OFAC_SDN": "2026-05-30"}

    async def test_threshold_filters_weak_matches(self, synced: SyncedBundle) -> None:
        source = BundleScreeningSource(synced)
        response = await source.screen(
            SearchQuery(name="Vladimir Ivanov", threshold=0.99, k=5),
            query_vector=make_vec(0.0),  # orthogonal: no strong vector hit
        )
        assert response.matches == []


def test_path_round_trip_screening(tmp_path: Path) -> None:
    """Smoke: SyncedBundle.entities_by_id indexes loaded entities."""
    from aml_filter.bundle.meta import OfacBundleMeta

    entity = Entity(
        entity_id="x",
        entity_type="PERSON",
        primary_name="Test",
        name_canonical="test",
        name_trigram="test",
        risk_category="SANCTION",
        source_list="OFAC_SDN",
        list_version="v1",
    )
    bundle = SyncedBundle(
        meta=OfacBundleMeta(
            list_id="OFAC_SDN",
            version="v1",
            entity_count=1,
            embedding_model="m",
            embedding_dim=384,
        ),
        entities=[entity],
        vector_backend=LocalVecBackend(),
    )
    assert bundle.entities_by_id["x"].primary_name == "Test"
