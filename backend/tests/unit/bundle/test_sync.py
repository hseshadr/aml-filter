"""Consumer tests: sync + verify a bundle, materialize entities + localvec index."""

from __future__ import annotations

from pathlib import Path

import pytest
from edgeproc.bundles.signing import SignatureError, generate_keypair

from aml_filter.bundle.publish import build_staging_dir, publish_bundle
from aml_filter.bundle.sync import sync_bundle
from aml_filter.domain.entity import Entity
from aml_filter.search.localvec_backend import EntityVector
from tests.unit.bundle.conftest import make_vec


def _publish(
    entities: list[Entity],
    vectors: list[EntityVector],
    private_path: Path,
    origin: Path,
    tmp_path: Path,
) -> None:
    staging = tmp_path / "staging"
    build_staging_dir(
        staging_dir=staging,
        entities=entities,
        vectors=vectors,
        list_id="OFAC_SDN",
        version="2026-05-30",
    )
    publish_bundle(
        staging_dir=staging,
        origin_dir=origin,
        private_key_path=private_path,
        list_id="OFAC_SDN",
        version="2026-05-30",
        entity_count=len(entities),
    )


@pytest.mark.unit
class TestSyncBundle:
    """sync_bundle round-trips entities, meta, and the localvec index."""

    async def test_round_trip_entities_and_meta(
        self,
        sample_entities: list[Entity],
        sample_vectors: list[EntityVector],
        keypair_paths: tuple[Path, Path],
        tmp_path: Path,
    ) -> None:
        private_path, public_path = keypair_paths
        origin = tmp_path / "origin"
        _publish(sample_entities, sample_vectors, private_path, origin, tmp_path)

        synced = sync_bundle(
            base_url=str(origin),
            verify_key_path=public_path,
            cache_root=tmp_path / "cache",
        )
        assert synced.meta.version == "2026-05-30"
        assert {e.entity_id for e in synced.entities} == {e.entity_id for e in sample_entities}

    async def test_round_trip_vector_index_searches(
        self,
        sample_entities: list[Entity],
        sample_vectors: list[EntityVector],
        keypair_paths: tuple[Path, Path],
        tmp_path: Path,
    ) -> None:
        private_path, public_path = keypair_paths
        origin = tmp_path / "origin"
        _publish(sample_entities, sample_vectors, private_path, origin, tmp_path)

        synced = sync_bundle(
            base_url=str(origin),
            verify_key_path=public_path,
            cache_root=tmp_path / "cache",
        )
        hits = await synced.vector_backend.vector_search(query_vector=make_vec(1.0), k=1)
        assert hits[0][0] == "e_ofac"

    async def test_wrong_key_fails_closed(
        self,
        sample_entities: list[Entity],
        sample_vectors: list[EntityVector],
        keypair_paths: tuple[Path, Path],
        tmp_path: Path,
    ) -> None:
        private_path, _ = keypair_paths
        origin = tmp_path / "origin"
        _publish(sample_entities, sample_vectors, private_path, origin, tmp_path)

        _, wrong_public = generate_keypair()
        wrong_pub_path = tmp_path / "wrong.pub"
        wrong_pub_path.write_bytes(wrong_public.public_bytes_raw())

        with pytest.raises(SignatureError):
            sync_bundle(
                base_url=str(origin),
                verify_key_path=wrong_pub_path,
                cache_root=tmp_path / "cache",
            )
