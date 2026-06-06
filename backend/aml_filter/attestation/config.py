"""Attestation signing configuration — how a signing key is provided to the service.

Loaded from :class:`aml_filter.config.Settings`: when
``ATTESTATION_SIGNING_KEY_PATH`` points to a raw ed25519 private key, attestations
are signed (and the matching public key — the bundle ``VERIFY_KEY_PATH`` — verifies
them). When unset, :func:`load_signing_config` returns ``None`` and attestations are
persisted unsigned. Fail-closed: a configured path that does not exist raises.
"""

from __future__ import annotations

from dataclasses import dataclass

from aml_filter.config import Settings


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
