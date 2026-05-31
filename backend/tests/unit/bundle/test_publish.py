"""Producer tests: build a signed OFAC bundle origin from ingested data."""

from __future__ import annotations

from pathlib import Path

import pytest

from aml_filter.bundle.meta import OfacBundleMeta
from aml_filter.bundle.publish import build_staging_dir, publish_bundle
from aml_filter.domain.entity import Entity
from aml_filter.search.localvec_backend import EntityVector


@pytest.mark.unit
class TestBuildStagingDir:
    """build_staging_dir lays out entities.jsonl + vector/ + ofac_meta.json."""

    def test_writes_all_bundle_files(
        self,
        sample_entities: list[Entity],
        sample_vectors: list[EntityVector],
        tmp_path: Path,
    ) -> None:
        staging = tmp_path / "staging"
        build_staging_dir(
            staging_dir=staging,
            entities=sample_entities,
            vectors=sample_vectors,
            list_id="OFAC_SDN",
            version="2026-05-30",
        )
        assert (staging / "entities.jsonl").is_file()
        assert (staging / "ofac_meta.json").is_file()
        assert (staging / "vector" / "state.json").is_file()

    def test_meta_records_counts_and_model(
        self,
        sample_entities: list[Entity],
        sample_vectors: list[EntityVector],
        tmp_path: Path,
    ) -> None:
        staging = tmp_path / "staging"
        build_staging_dir(
            staging_dir=staging,
            entities=sample_entities,
            vectors=sample_vectors,
            list_id="OFAC_SDN",
            version="2026-05-30",
        )
        meta = OfacBundleMeta.model_validate_json((staging / "ofac_meta.json").read_bytes())
        assert meta.list_id == "OFAC_SDN"
        assert meta.version == "2026-05-30"
        assert meta.entity_count == len(sample_entities)
        assert meta.embedding_dim == 384

    def test_entities_jsonl_round_trips_each_entity(
        self,
        sample_entities: list[Entity],
        sample_vectors: list[EntityVector],
        tmp_path: Path,
    ) -> None:
        staging = tmp_path / "staging"
        build_staging_dir(
            staging_dir=staging,
            entities=sample_entities,
            vectors=sample_vectors,
            list_id="OFAC_SDN",
            version="2026-05-30",
        )
        lines = (staging / "entities.jsonl").read_text(encoding="utf-8").strip().splitlines()
        loaded = [Entity.model_validate_json(line) for line in lines]
        assert [e.entity_id for e in loaded] == [e.entity_id for e in sample_entities]


@pytest.mark.unit
class TestPublishBundle:
    """publish_bundle produces a signed, content-addressed origin a device can sync."""

    def test_writes_signed_origin(
        self,
        sample_entities: list[Entity],
        sample_vectors: list[EntityVector],
        keypair_paths: tuple[Path, Path],
        tmp_path: Path,
    ) -> None:
        private_path, _ = keypair_paths
        staging = tmp_path / "staging"
        origin = tmp_path / "origin"
        build_staging_dir(
            staging_dir=staging,
            entities=sample_entities,
            vectors=sample_vectors,
            list_id="OFAC_SDN",
            version="2026-05-30",
        )
        publish_bundle(
            staging_dir=staging,
            origin_dir=origin,
            private_key_path=private_path,
            list_id="OFAC_SDN",
            version="2026-05-30",
            entity_count=len(sample_entities),
        )
        # An active version pointer signals a complete, signed origin.
        assert any(origin.rglob("*")), "origin should contain published objects"
