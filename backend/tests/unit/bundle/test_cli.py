"""CLI tests: keygen, bundle, and sync round-trip.

The bundle/screen CLI paths construct a real `EmbeddingService`; the autouse
`_offline_embedder` fixture (`tests/unit/conftest.py`) stubs the heavy model class
so this round-trip never downloads from HuggingFace.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from typer.testing import CliRunner

from aml_filter import cli
from aml_filter.domain.entity import Entity

runner = CliRunner()


@pytest.mark.unit
def test_keygen_writes_keypair(tmp_path: Path) -> None:
    priv = tmp_path / "trust.key"
    pub = tmp_path / "trust.pub"
    result = runner.invoke(cli.app, ["keygen", str(priv), str(pub)])
    assert result.exit_code == 0, result.output
    assert len(priv.read_bytes()) == 32
    assert len(pub.read_bytes()) == 32


@pytest.mark.unit
def test_bundle_then_sync_round_trip(tmp_path: Path) -> None:
    priv, pub = tmp_path / "trust.key", tmp_path / "trust.pub"
    assert runner.invoke(cli.app, ["keygen", str(priv), str(pub)]).exit_code == 0

    entities_path = tmp_path / "entities.jsonl"
    entity = Entity(
        entity_id="e_ofac",
        entity_type="PERSON",
        primary_name="Vladimir Ivanov",
        name_canonical="vladimir ivanov",
        name_trigram="vladimir ivanov",
        risk_category="SANCTION",
        source_list="OFAC_SDN",
        list_version="2026-05-30",
    )
    entities_path.write_text(entity.model_dump_json() + "\n", encoding="utf-8")

    origin = tmp_path / "origin"
    build = runner.invoke(
        cli.app,
        ["bundle", str(entities_path), str(origin), str(priv), "--version", "2026-05-30"],
    )
    assert build.exit_code == 0, build.output

    sync = runner.invoke(
        cli.app, ["sync", str(origin), str(pub), "--cache", str(tmp_path / "cache")]
    )
    assert sync.exit_code == 0, sync.output
    assert "2026-05-30" in sync.output
    assert "1 entities" in sync.output

    screen = runner.invoke(
        cli.app,
        [
            "screen",
            "Vladimir Ivanov",
            str(origin),
            str(pub),
            "--cache",
            str(tmp_path / "screen-cache"),
            "--threshold",
            "0.0",
        ],
    )
    assert screen.exit_code == 0, screen.output
    assert "e_ofac" in screen.output
