"""Typer CLI for AML-Filter bundle distribution — keygen, bundle, sync.

Mirrors edge-reco's CLI ergonomics for the signed, content-addressed OFAC bundle
delivery loop:

    amlfilter keygen   ./trust.key ./trust.pub
    amlfilter bundle   ./entities.jsonl ./origin ./trust.key --list-id OFAC_SDN
    amlfilter sync     ./origin ./trust.pub --cache ./.ofac_bundle

``bundle`` reads a JSONL of domain ``Entity`` records, embeds each name with the
sentence-transformers encoder, builds the localvec index, and publishes a signed
origin. ``sync`` pulls + ed25519-verifies that origin into a local cache.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Annotated

import typer
from edgeproc.bundles.signing import generate_keypair

from aml_filter.bundle.publish import build_staging_dir, publish_bundle
from aml_filter.bundle.screening import BundleScreeningSource
from aml_filter.bundle.sync import sync_bundle
from aml_filter.domain.entity import Entity
from aml_filter.domain.normalization import prepare_embedding_text
from aml_filter.domain.search import SearchQuery
from aml_filter.embedding.service import EmbeddingService
from aml_filter.search.localvec_backend import EntityVector

app = typer.Typer(name="amlfilter", help="AML-Filter: signed OFAC bundle distribution.")

_DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


@app.command()
def keygen(
    private_key_path: Annotated[
        Path, typer.Argument(help="Output path for the ed25519 private key")
    ],
    public_key_path: Annotated[Path, typer.Argument(help="Output path for the ed25519 public key")],
) -> None:
    """Mint an ed25519 trust root: a raw private key + its public verify key."""
    private, public = generate_keypair()
    private_key_path.parent.mkdir(parents=True, exist_ok=True)
    public_key_path.parent.mkdir(parents=True, exist_ok=True)
    private_key_path.write_bytes(private.private_bytes_raw())
    public_key_path.write_bytes(public.public_bytes_raw())
    typer.echo(f"Wrote private key -> {private_key_path}, public key -> {public_key_path}")


@app.command()
def bundle(
    entities_jsonl: Annotated[Path, typer.Argument(help="Input JSONL of domain Entity records")],
    origin_dir: Annotated[Path, typer.Argument(help="Output origin dir a device can sync")],
    private_key_path: Annotated[Path, typer.Argument(help="Raw ed25519 private key (keygen)")],
    list_id: Annotated[str, typer.Option(help="OFAC list id")] = "OFAC_SDN",
    version: Annotated[str, typer.Option(help="Bundle version string")] = "v1",
    embedding_model: Annotated[str, typer.Option(help="Embedding model id")] = _DEFAULT_MODEL,
) -> None:
    """Ingest an entities JSONL, embed + index it, and publish a signed bundle origin."""
    entities = _load_entities(entities_jsonl)
    staging = origin_dir.parent / f"{origin_dir.name}.staging"
    asyncio.run(
        _build_and_publish(
            entities=entities,
            staging=staging,
            origin_dir=origin_dir,
            private_key_path=private_key_path,
            list_id=list_id,
            version=version,
            embedding_model=embedding_model,
        )
    )
    typer.echo(f"Built bundle '{list_id}' v{version} ({len(entities)} entities) -> {origin_dir}")


@app.command()
def sync(
    base_url: Annotated[str, typer.Argument(help="Bundle origin: http(s):// URL or local path")],
    verify_key_path: Annotated[Path, typer.Argument(help="Pinned ed25519 public key")],
    cache: Annotated[Path, typer.Option(help="Local cache root")] = Path(".ofac_bundle"),
) -> None:
    """Pull + ed25519-verify a bundle and report its version + entity count."""
    synced = sync_bundle(base_url=base_url, verify_key_path=verify_key_path, cache_root=cache)
    typer.echo(
        f"Synced '{synced.meta.list_id}' v{synced.meta.version} "
        f"({len(synced.entities)} entities) -> {cache}"
    )


@app.command()
def screen(
    name: Annotated[str, typer.Argument(help="Name to screen against the synced bundle")],
    base_url: Annotated[str, typer.Argument(help="Bundle origin: http(s):// URL or local path")],
    verify_key_path: Annotated[Path, typer.Argument(help="Pinned ed25519 public key")],
    cache: Annotated[Path, typer.Option(help="Local cache root")] = Path(".ofac_bundle"),
    threshold: Annotated[float, typer.Option(help="Match threshold")] = 0.65,
    k: Annotated[int, typer.Option(help="Max matches")] = 20,
) -> None:
    """Screen a name against a synced bundle (no Postgres) and print matches."""
    asyncio.run(
        _screen_against_bundle(
            name=name,
            base_url=base_url,
            verify_key_path=verify_key_path,
            cache=cache,
            threshold=threshold,
            k=k,
        )
    )


async def _screen_against_bundle(
    *,
    name: str,
    base_url: str,
    verify_key_path: Path,
    cache: Path,
    threshold: float,
    k: int,
) -> None:
    """Sync the bundle, embed the query, screen, and echo each match."""
    synced = sync_bundle(base_url=base_url, verify_key_path=verify_key_path, cache_root=cache)
    query_vector = await EmbeddingService().embed(name)
    response = await BundleScreeningSource(synced).screen(
        SearchQuery(name=name, country=None, threshold=threshold, k=k), query_vector=query_vector
    )
    typer.echo(f"{len(response.matches)} match(es) (versions: {response.list_versions_used})")
    for match in response.matches:
        typer.echo(f"  {match.score:.3f}  {match.entity_id}  {match.primary_name}")


def _load_entities(path: Path) -> list[Entity]:
    """Parse one JSON ``Entity`` record per line."""
    text = path.read_text(encoding="utf-8")
    return [Entity.model_validate_json(line) for line in text.splitlines() if line.strip()]


async def _build_and_publish(
    *,
    entities: list[Entity],
    staging: Path,
    origin_dir: Path,
    private_key_path: Path,
    list_id: str,
    version: str,
    embedding_model: str,
) -> None:
    """Embed entities, build the staging dir, and publish the signed origin."""
    vectors = await _embed_entities(entities)
    build_staging_dir(
        staging_dir=staging,
        entities=entities,
        vectors=vectors,
        list_id=list_id,
        version=version,
        embedding_model=embedding_model,
    )
    publish_bundle(
        staging_dir=staging,
        origin_dir=origin_dir,
        private_key_path=private_key_path,
        list_id=list_id,
        version=version,
        entity_count=len(entities),
    )


async def _embed_entities(entities: list[Entity]) -> list[EntityVector]:
    """Embed each entity name (+ first country) into an EntityVector via the encoder."""
    service = EmbeddingService()
    vectors: list[EntityVector] = []
    for entity in entities:
        country = entity.countries[0] if entity.countries else None
        embedding = await service.embed(prepare_embedding_text(entity.primary_name, country))
        vectors.append(_entity_vector(entity, embedding))
    return vectors


def _entity_vector(entity: Entity, embedding: list[float]) -> EntityVector:
    """Pair an entity with its embedding + the localvec filter metadata."""
    return EntityVector(
        entity_id=entity.entity_id,
        embedding=embedding,
        source_list=entity.source_list,
        risk_category=entity.risk_category,
        entity_type=entity.entity_type,
        tenant_id=entity.tenant_id,
    )


if __name__ == "__main__":  # pragma: no cover
    app()
