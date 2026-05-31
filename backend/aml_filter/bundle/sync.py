"""Consumer: sync + verify a signed OFAC bundle, then load it for screening.

Mirrors edge-reco's ``from_synced``: ``sync_index`` (fail-closed ed25519 verify) ->
read the active pointer + manifest -> ``materialize_file`` each entry into a local
dir -> load ``ofac_meta.json``, the entities (``entities.jsonl``), and the localvec
index (``vector/``). The result is screenable WITHOUT Postgres.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import cached_property
from pathlib import Path
from typing import Final

from edgeproc.bundles.adapters import FetchAdapter, FilesystemAdapter, HttpAdapter
from edgeproc.bundles.cas import FilesystemCacheStore
from edgeproc.bundles.manifest import IndexManifest
from edgeproc.bundles.signing import Ed25519Verifier, Verifier
from edgeproc.bundles.sync import materialize_file, sync_index

from aml_filter.bundle.meta import OfacBundleMeta
from aml_filter.domain.entity import Entity
from aml_filter.search.localvec_backend import LocalVecBackend

_ENTITIES_NAME: Final[str] = "entities.jsonl"
_META_NAME: Final[str] = "ofac_meta.json"
_VECTOR_DIR: Final[str] = "vector"


@dataclass(frozen=True)
class SyncedBundle:
    """A verified, materialized OFAC bundle ready for in-memory screening."""

    meta: OfacBundleMeta
    entities: list[Entity]
    vector_backend: LocalVecBackend
    _by_id: dict[str, Entity] = field(default_factory=dict, repr=False)

    @cached_property
    def entities_by_id(self) -> dict[str, Entity]:
        """Entities indexed by ``entity_id`` for O(1) candidate lookup during scoring."""
        return {e.entity_id: e for e in self.entities}


def sync_bundle(
    *,
    base_url: str,
    verify_key_path: Path,
    cache_root: Path,
) -> SyncedBundle:
    """Sync + ed25519-verify the bundle at ``base_url`` and load it into a SyncedBundle."""
    verifier = Ed25519Verifier.from_public_bytes(verify_key_path.read_bytes())
    store, manifest = _sync_and_load_manifest(
        base_url=base_url, cache_root=cache_root, verifier=verifier
    )
    local = _materialize_bundle(store, manifest, cache_root / "materialized")
    return _load_synced(local)


def _load_synced(local: Path) -> SyncedBundle:
    """Load meta, entities, and the localvec index from a materialized bundle dir."""
    meta = OfacBundleMeta.model_validate_json((local / _META_NAME).read_bytes())
    entities = _load_entities(local / _ENTITIES_NAME)
    vector_backend = LocalVecBackend.load(local / _VECTOR_DIR)
    return SyncedBundle(meta=meta, entities=entities, vector_backend=vector_backend)


def _load_entities(path: Path) -> list[Entity]:
    """Parse ``entities.jsonl`` (one JSON ``Entity`` record per line)."""
    text = path.read_text(encoding="utf-8")
    return [Entity.model_validate_json(line) for line in text.splitlines() if line.strip()]


def _sync_and_load_manifest(
    *, base_url: str, cache_root: Path, verifier: Verifier
) -> tuple[FilesystemCacheStore, IndexManifest]:
    """Sync the origin into a fresh store, then load + validate the active manifest."""
    store = FilesystemCacheStore(cache_root)
    sync_index(base_url=base_url, store=store, adapter=_select_adapter(base_url), verifier=verifier)
    pointer = store.read_active()
    if pointer is None:  # pragma: no cover - sync_index promotes or raises
        raise RuntimeError("sync completed without promoting an active version")
    return store, IndexManifest.model_validate_json(store.get_manifest(pointer.manifest_hash))


def _materialize_bundle(store: FilesystemCacheStore, manifest: IndexManifest, dest: Path) -> Path:
    """Reassemble every bundled file (vector/ subdir preserved) into ``dest``."""
    for entry in manifest.files:
        out = dest / entry.path
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(materialize_file(store, manifest, entry.path))
    return dest


def _select_adapter(base_url: str) -> FetchAdapter:
    """HTTP adapter for an http(s) origin, filesystem adapter for a local path."""
    if base_url.startswith(("http://", "https://")):
        return HttpAdapter()
    return FilesystemAdapter()
