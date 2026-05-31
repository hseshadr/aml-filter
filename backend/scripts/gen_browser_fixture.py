"""Generate the committed signed-bundle fixture the @amlfilter/browser tests load.

Produces a deterministic, MODEL-FREE bundle origin (no encoder needed) plus a
pinned public key, so the TS engine's Vitest suite proves byte-parity with this
Python producer against a self-contained fixture:

    backend $ uv run python scripts/gen_browser_fixture.py <out_dir>

<out_dir> should be the package fixture root, e.g.
    ../frontend/packages/amlfilter-browser/src/engine/__fixtures__/bundle

Layout written:
    <out_dir>/keys/public.key          # pinned ed25519 verify key (raw 32 bytes)
    <out_dir>/origin/latest            # signed VersionPointer
    <out_dir>/origin/manifest/<hash>   # IndexManifest
    <out_dir>/origin/chunk/<hash>      # verbatim zstd chunks
"""

from __future__ import annotations

import sys
from pathlib import Path

from edgeproc.bundles.signing import generate_keypair

from aml_filter.bundle.publish import build_staging_dir, publish_bundle
from aml_filter.domain.entity import Entity
from aml_filter.search.localvec_backend import EntityVector

_DIM = 384
_LIST_ID = "OFAC_SDN"
_VERSION = "2026-05-30"


def make_vec(seed: float) -> list[float]:
    """A 384-dim L2-normalized vector; seed=1.0 is the exact-hit direction."""
    raw = [seed, 1.0 - seed, *([0.0] * (_DIM - 2))]
    norm = sum(v * v for v in raw) ** 0.5
    return [v / norm for v in raw]


def make_entity(entity_id: str, name: str) -> Entity:
    """A fictional SANCTION Entity for the browser screening fixture."""
    return Entity(
        entity_id=entity_id,
        entity_type="PERSON",
        primary_name=name,
        name_canonical=name.lower(),
        name_trigram=name.lower(),
        risk_category="SANCTION",
        source_list=_LIST_ID,
        list_version=_VERSION,
        countries=["RU"],
    )


def _entities() -> list[Entity]:
    return [
        make_entity("e_ivanov", "Vladimir Ivanov"),
        make_entity("e_petrov", "Boris Petrov"),
        make_entity("e_acme", "Acme Holdings"),
    ]


def _vectors(entities: list[Entity]) -> list[EntityVector]:
    seeds = {"e_ivanov": 1.0, "e_petrov": 0.9, "e_acme": 0.2}
    return [
        EntityVector(
            entity_id=e.entity_id,
            embedding=make_vec(seeds[e.entity_id]),
            source_list=e.source_list,
            risk_category=e.risk_category,
            entity_type=e.entity_type,
            tenant_id=None,
        )
        for e in entities
    ]


def main(out_dir: Path) -> None:
    """Build the keypair, staging dir, and signed origin under out_dir."""
    entities = _entities()
    staging = out_dir / "staging"
    keys = out_dir / "keys"
    origin = out_dir / "origin"
    keys.mkdir(parents=True, exist_ok=True)

    private, public = generate_keypair()
    private_path = keys / "private.key"
    private_path.write_bytes(private.private_bytes_raw())
    (keys / "public.key").write_bytes(public.public_bytes_raw())

    build_staging_dir(
        staging_dir=staging,
        entities=entities,
        vectors=_vectors(entities),
        list_id=_LIST_ID,
        version=_VERSION,
    )
    publish_bundle(
        staging_dir=staging,
        origin_dir=origin,
        private_key_path=private_path,
        list_id=_LIST_ID,
        version=_VERSION,
        entity_count=len(entities),
    )
    print(f"wrote fixture bundle to {out_dir}")


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve())
