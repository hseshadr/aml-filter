"""Shared fixtures for bundle producer/consumer tests.

A deterministic, model-free corpus: each entity carries a 384-dim L2-normalized
vector so the localvec FAISS index ranks predictably without loading a real encoder.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from edgeproc.bundles.signing import generate_keypair

from aml_filter.domain.entity import Entity
from aml_filter.search.localvec_backend import EntityVector


def make_vec(seed: float) -> list[float]:
    """A 384-dim L2-normalized vector; seed=1.0 is the exact-hit direction."""
    raw = [seed, 1.0 - seed, *([0.0] * 382)]
    norm = sum(v * v for v in raw) ** 0.5
    return [v / norm for v in raw]


def make_entity(entity_id: str, name: str, source_list: str = "OFAC_SDN") -> Entity:
    """A minimal valid SANCTION Entity for bundle round-trip tests."""
    return Entity(
        entity_id=entity_id,
        entity_type="PERSON",
        primary_name=name,
        name_canonical=name.lower(),
        name_trigram=name.lower(),
        risk_category="SANCTION",
        source_list=source_list,
        list_version="2026-05-30",
    )


@pytest.fixture
def sample_entities() -> list[Entity]:
    """Three OFAC SANCTION entities."""
    return [
        make_entity("e_ofac", "Vladimir Ivanov"),
        make_entity("e_eu", "Boris Petrov"),
        make_entity("e_org", "Acme Holdings"),
    ]


@pytest.fixture
def sample_vectors(sample_entities: list[Entity]) -> list[EntityVector]:
    """One deterministic EntityVector per sample entity (e_ofac is the exact hit)."""
    seeds = {"e_ofac": 1.0, "e_eu": 0.9, "e_org": 0.8}
    return [
        EntityVector(
            entity_id=e.entity_id,
            embedding=make_vec(seeds[e.entity_id]),
            source_list=e.source_list,
            risk_category=e.risk_category,
            entity_type=e.entity_type,
            tenant_id=e.tenant_id,
        )
        for e in sample_entities
    ]


@pytest.fixture
def keypair_paths(tmp_path: Path) -> tuple[Path, Path]:
    """Write a fresh ed25519 keypair to disk; return (private_path, public_path)."""
    private, public = generate_keypair()
    private_path = tmp_path / "trust.key"
    public_path = tmp_path / "trust.pub"
    private_path.write_bytes(private.private_bytes_raw())
    public_path.write_bytes(public.public_bytes_raw())
    return private_path, public_path
