"""Producer: build a signed, content-addressed OFAC bundle origin.

A thin domain wrapper over edge-proc's ``build_bundle``. Given a *staging dir*
(``entities.jsonl`` + a saved localvec ``vector/`` dir + ``ofac_meta.json``) and a
private key, it reads every bundle file into ``{relpath: bytes}`` and lets edge-proc
chunk + sign + lay out the flat origin a device can ``sync_index``.

The bundle CONTRACT (what the consumer's ``sync_bundle`` relies on):

- ``entities.jsonl`` — one JSON ``Entity`` domain record per line (everything
  screening/scoring needs: id, names, aliases, countries, dob, type, risk, list).
- ``vector/<faiss files>`` — the prebuilt localvec index, verbatim (zero recompute).
- ``ofac_meta.json`` — ``OfacBundleMeta`` (list_id, version, counts, embedding model).

edge-proc stays generic (opaque files only); this module owns the domain shape.
"""

from __future__ import annotations

import asyncio
from collections.abc import Coroutine
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Final

from edgeproc.bundles.cas import FilesystemCacheStore
from edgeproc.bundles.chunking import GearCDC
from edgeproc.bundles.publish import build_bundle
from edgeproc.bundles.signing import Ed25519Signer

from aml_filter.bundle.meta import OfacBundleMeta
from aml_filter.domain.entity import Entity
from aml_filter.embedding import EMBEDDING_DIM
from aml_filter.search.localvec_backend import (
    EntityVector,
    LocalVecBackend,
    entity_vector_to_embedding,
)

_ENTITIES_NAME: Final[str] = "entities.jsonl"
_META_NAME: Final[str] = "ofac_meta.json"
_VECTOR_DIR: Final[str] = "vector"
_DEFAULT_MODEL: Final[str] = "sentence-transformers/all-MiniLM-L6-v2"


def build_staging_dir(
    *,
    staging_dir: Path,
    entities: list[Entity],
    vectors: list[EntityVector],
    list_id: str,
    version: str,
    embedding_model: str = _DEFAULT_MODEL,
) -> OfacBundleMeta:
    """Lay out ``entities.jsonl`` + ``vector/`` + ``ofac_meta.json`` in ``staging_dir``."""
    staging_dir.mkdir(parents=True, exist_ok=True)
    _write_entities(staging_dir / _ENTITIES_NAME, entities)
    _save_vector_index(staging_dir / _VECTOR_DIR, vectors)
    meta = OfacBundleMeta(
        list_id=list_id,
        version=version,
        entity_count=len(entities),
        embedding_model=embedding_model,
        embedding_dim=EMBEDDING_DIM,
    )
    (staging_dir / _META_NAME).write_text(meta.model_dump_json(), encoding="utf-8")
    return meta


def _write_entities(path: Path, entities: list[Entity]) -> None:
    """Write one JSON ``Entity`` record per line."""
    lines = [e.model_dump_json() for e in entities]
    path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def _save_vector_index(vector_dir: Path, vectors: list[EntityVector]) -> None:
    """Build a localvec index from the vectors and persist it under ``vector/``.

    The insert runs on a private event loop in a worker thread, so building works
    whether or not the caller is already inside a running loop (async CLI / test).
    """
    backend = LocalVecBackend()
    embeddings = [entity_vector_to_embedding(v) for v in vectors]
    _run_blocking(backend.insert_embeddings(embeddings))
    backend.save(vector_dir)


def _run_blocking(coro: Coroutine[object, object, None]) -> None:
    """Run ``coro`` to completion on a fresh loop, even inside a running loop."""
    with ThreadPoolExecutor(max_workers=1) as pool:
        pool.submit(lambda: asyncio.run(coro)).result()


def publish_bundle(
    *,
    staging_dir: Path,
    origin_dir: Path,
    private_key_path: Path,
    list_id: str,
    version: str,
    entity_count: int,
) -> None:
    """Build the signed origin from a prepared staging dir (entities + vector + meta)."""
    del entity_count  # staging already records counts in ofac_meta.json
    files = _read_bundle_files(staging_dir)
    signer = Ed25519Signer.from_private_bytes(private_key_path.read_bytes())
    origin_dir.mkdir(parents=True, exist_ok=True)
    build_bundle(
        files=files,
        store=FilesystemCacheStore(origin_dir),
        chunker=GearCDC(),
        signer=signer,
        bundle_id=list_id,
        version=version,
    )


def _read_bundle_files(staging_dir: Path) -> dict[str, bytes]:
    """Read every bundle file into ``{relpath: bytes}`` (vector/ recursed)."""
    files: dict[str, bytes] = {
        _ENTITIES_NAME: (staging_dir / _ENTITIES_NAME).read_bytes(),
        _META_NAME: (staging_dir / _META_NAME).read_bytes(),
    }
    for path in sorted((staging_dir / _VECTOR_DIR).rglob("*")):
        if path.is_file():
            files[path.relative_to(staging_dir).as_posix()] = path.read_bytes()
    return files


# Re-export so callers building vectors don't reach into the search package directly.
__all__ = ["EntityVector", "build_staging_dir", "entity_vector_to_embedding", "publish_bundle"]
