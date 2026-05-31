"""Config-gated bundle screening runtime: load a source from a synced origin."""

from __future__ import annotations

from pathlib import Path

import pytest

from aml_filter.bundle.publish import build_staging_dir, publish_bundle
from aml_filter.bundle.runtime import load_bundle_screening_source
from aml_filter.config import Settings
from aml_filter.domain.entity import Entity
from aml_filter.domain.search import SearchQuery
from aml_filter.search.localvec_backend import EntityVector
from tests.unit.bundle.conftest import make_vec


def _settings(
    database_url: str = "postgresql+asyncpg://u:p@localhost:5432/db", **kw: object
) -> Settings:
    return Settings(_env_file=None, database_url=database_url, **kw)  # type: ignore[call-arg]


@pytest.mark.unit
def test_load_requires_bundle_mode() -> None:
    """Loading without BUNDLE_BASE_URL/VERIFY_KEY_PATH fails closed."""
    with pytest.raises(RuntimeError, match="BUNDLE_BASE_URL"):
        load_bundle_screening_source(_settings())


@pytest.mark.unit
async def test_load_and_screen_from_origin(
    sample_entities: list[Entity],
    sample_vectors: list[EntityVector],
    keypair_paths: tuple[Path, Path],
    tmp_path: Path,
) -> None:
    """A config-gated source loads from a signed origin and screens a name (no DB)."""
    private_path, public_path = keypair_paths
    staging, origin = tmp_path / "staging", tmp_path / "origin"
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
    settings = _settings(
        bundle_base_url=str(origin),
        verify_key_path=str(public_path),
        bundle_cache_dir=str(tmp_path / "cache"),
    )
    assert settings.bundle_mode_active() is True

    source = load_bundle_screening_source(settings)
    response = await source.screen(
        SearchQuery(name="Vladimir Ivanov", threshold=0.0, k=5), query_vector=make_vec(1.0)
    )
    assert response.matches[0].entity_id == "e_ofac"
    assert response.list_versions_used == {"OFAC_SDN": "2026-05-30"}
