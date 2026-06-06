"""Tests for the attestation badge renderer + signing-config loader."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from aml_filter.attestation import renderer
from aml_filter.attestation.config import load_signing_config
from aml_filter.config import Settings
from aml_filter.domain.attestation import (
    AttestationRecord,
    AttestationStatus,
    ListVersionEntry,
    ResultSummary,
)

_NOW = datetime(2026, 6, 6, 12, 0, 0, tzinfo=UTC)


def _record(signed: bool, lists: list[ListVersionEntry] | None = None) -> AttestationRecord:
    """Build an attestation read model, optionally with signature fields populated."""
    return AttestationRecord(
        attestation_id="att-1",
        tenant_id="acme",
        customer_id="cust-1",
        customer_reference="ACME-001",
        screened_at=_NOW,
        valid_until=_NOW + timedelta(days=90),
        lists_and_versions=lists
        if lists is not None
        else [ListVersionEntry(list_id="OFAC_SDN", version="2026-06-01")],
        result=ResultSummary(status=AttestationStatus.CLEAR, match_count=0, pending_count=0),
        signature="c2ln" if signed else None,
        signing_key_id="k1" if signed else None,
        algo="ed25519" if signed else None,
        created_at=_NOW,
    )


def test_should_render_pdf_with_pdf_magic_bytes() -> None:
    # Given a signed attestation
    # When rendered to PDF
    body = renderer.render_pdf(_record(signed=True))
    # Then it is a valid PDF
    assert body.startswith(b"%PDF")


def test_should_render_pdf_when_unsigned_and_no_lists() -> None:
    # Given an unsigned attestation with no enabled lists
    # When rendered to PDF (exercises the unsigned + empty-list branches)
    body = renderer.render_pdf(_record(signed=False, lists=[]))
    # Then it still produces a PDF
    assert body.startswith(b"%PDF")


def test_should_render_json_with_record_fields() -> None:
    # Given an attestation
    # When rendered to JSON
    body = renderer.render_json(_record(signed=True))
    # Then it carries the record content
    assert b"ACME-001" in body
    assert b"OFAC_SDN" in body


def test_load_signing_config_returns_none_without_key(tmp_path: Path) -> None:
    # Given settings with no signing key path
    settings = Settings(database_url="postgresql+asyncpg://u:p@localhost/db")  # type: ignore[call-arg]
    # When loading the signing config
    # Then it is None (attestations persist unsigned)
    assert load_signing_config(settings) is None


def test_load_signing_config_raises_when_key_missing(tmp_path: Path) -> None:
    # Given a configured but non-existent key path
    settings = Settings(  # type: ignore[call-arg]
        database_url="postgresql+asyncpg://u:p@localhost/db",
        attestation_signing_key_path=tmp_path / "absent.key",
    )
    # When/Then loading fails closed
    with pytest.raises(FileNotFoundError):
        load_signing_config(settings)


def test_load_signing_config_reads_present_key(tmp_path: Path) -> None:
    # Given a real key file on disk
    key = tmp_path / "trust.key"
    key.write_bytes(b"x" * 32)
    settings = Settings(  # type: ignore[call-arg]
        database_url="postgresql+asyncpg://u:p@localhost/db",
        attestation_signing_key_path=key,
        attestation_signing_key_id="root-1",
        attestation_validity_days=30,
    )
    # When loading the signing config
    config = load_signing_config(settings)
    # Then it carries the key bytes, id, and window
    assert config is not None
    assert config.signer_private_bytes == b"x" * 32
    assert config.signing_key_id == "root-1"
    assert config.validity_days == 30
