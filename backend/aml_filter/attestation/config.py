"""Attestation signing configuration — how a signing key is provided to the service.

Loaded from :class:`aml_filter.config.Settings`: when
``ATTESTATION_SIGNING_KEY_PATH`` points to a raw ed25519 private key, attestations
are signed (and the matching public key — the bundle ``VERIFY_KEY_PATH`` — verifies
them). When unset, :func:`load_signing_config` returns ``None`` and attestations are
persisted unsigned. Fail-closed: a configured path that does not exist raises.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from aml_filter.config import Settings

if TYPE_CHECKING:
    from aml_filter.attestation.service import AttestationService


@dataclass(frozen=True)
class AttestationSigningConfig:
    """Resolved signing material + validity window for the attestation service."""

    signer_private_bytes: bytes
    signing_key_id: str
    validity_days: int


def load_signing_config(settings: Settings) -> AttestationSigningConfig | None:
    """Build a signing config from settings, or ``None`` when no key is configured."""
    key_path = settings.attestation_signing_key_path
    if key_path is None:
        return None
    if not key_path.is_file():
        raise FileNotFoundError(f"Attestation signing key not found: {key_path}")
    return AttestationSigningConfig(
        signer_private_bytes=key_path.read_bytes(),
        signing_key_id=settings.attestation_signing_key_id,
        validity_days=settings.attestation_validity_days,
    )


def assert_signing_pair_pinned(service: AttestationService, verify_key_path: Path | None) -> None:
    """Fail closed unless the signer's public half matches the pinned verify key.

    When BOTH a signing key and ``VERIFY_KEY_PATH`` are configured, the signer's public
    half MUST equal the pinned trust-root public bytes — otherwise every ``/verify`` would
    silently return invalid and a rotated verify key would become a forge surface. When
    either side is unset there is nothing to pin, so this is a no-op.
    """
    if service.signing_config is None or verify_key_path is None:
        return
    if not verify_key_path.is_file():
        raise ValueError(f"Verification key not found: {verify_key_path}")
    if service.public_key_raw() != verify_key_path.read_bytes():
        raise ValueError(
            "Attestation signing key does not match the pinned VERIFY_KEY_PATH public key"
        )
