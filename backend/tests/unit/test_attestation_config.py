"""Unit tests for attestation signing-key/verify-key pinning (fail-closed pairing)."""

from __future__ import annotations

from pathlib import Path

import pytest
from edgeproc.bundles.signing import generate_keypair

from aml_filter.attestation.config import AttestationSigningConfig, assert_signing_pair_pinned
from aml_filter.attestation.service import AttestationService


def _signing_service(private_bytes: bytes) -> AttestationService:
    """Build a service carrying a signing config from raw private-key bytes."""
    config = AttestationSigningConfig(
        signer_private_bytes=private_bytes, signing_key_id="k1", validity_days=90
    )
    return AttestationService(session=None, signing_config=config)  # type: ignore[arg-type]


def test_pinning_passes_when_signer_public_matches_verify_key(tmp_path: Path) -> None:
    # Given a signing key whose public half is written as the pinned verify key
    private, public = generate_keypair()
    verify_path = tmp_path / "public.key"
    verify_path.write_bytes(public.public_bytes_raw())
    service = _signing_service(private.private_bytes_raw())

    # When asserting the pair, then it does not raise (matched pair)
    assert_signing_pair_pinned(service, verify_path)


def test_pinning_raises_when_signer_public_differs_from_verify_key(tmp_path: Path) -> None:
    # Given a signing key and an UNRELATED pinned verify key
    private, _ = generate_keypair()
    _, other_public = generate_keypair()
    verify_path = tmp_path / "public.key"
    verify_path.write_bytes(other_public.public_bytes_raw())
    service = _signing_service(private.private_bytes_raw())

    # When asserting the pair, then it fails closed
    with pytest.raises(ValueError, match="does not match the pinned"):
        assert_signing_pair_pinned(service, verify_path)


def test_pinning_is_noop_when_no_signing_config(tmp_path: Path) -> None:
    # Given a service with no signing config but a configured verify key
    _, public = generate_keypair()
    verify_path = tmp_path / "public.key"
    verify_path.write_bytes(public.public_bytes_raw())
    service = AttestationService(session=None, signing_config=None)  # type: ignore[arg-type]

    # When asserting the pair, then there is nothing to pin (no-op)
    assert_signing_pair_pinned(service, verify_path)


def test_pinning_is_noop_when_no_verify_key() -> None:
    # Given a signing service but no configured verify key
    private, _ = generate_keypair()
    service = _signing_service(private.private_bytes_raw())

    # When asserting with no verify key, then there is nothing to pin (no-op)
    assert_signing_pair_pinned(service, None)
