"""Sign and verify attestation payloads with the bundle ed25519 trust root.

Reuses edge-proc's ``Ed25519Signer`` / ``Ed25519Verifier`` (the same crypto that
signs and fail-closed-verifies OFAC bundles) over the canonical attestation bytes.
``sign_payload`` returns a detached base64 signature; ``verify_payload`` re-derives
the canonical bytes and checks the signature, returning a typed, never-raising
result so the API can surface a clear ``{valid, reason}`` for a badge check.
"""

from __future__ import annotations

from typing import Final

from edgeproc.bundles.signing import Ed25519Signer, Ed25519Verifier, SignatureError
from pydantic import BaseModel

from aml_filter.attestation.canonical import canonical_payload_bytes
from aml_filter.domain.attestation import AttestationPayload

#: Identifier for the signature scheme recorded alongside a signed attestation.
SIGNING_ALGO: Final[str] = "ed25519"


class VerificationResult(BaseModel):
    """Outcome of verifying an attestation signature (never raises to the caller)."""

    valid: bool
    reason: str


def sign_payload(payload: AttestationPayload, signer: Ed25519Signer) -> str:
    """Sign the canonical payload bytes, returning a detached base64 signature."""
    return signer.sign(canonical_payload_bytes(payload))


def verify_payload(
    payload: AttestationPayload, signature: str | None, public_key_raw: bytes
) -> VerificationResult:
    """Verify a signature over the re-derived canonical payload, fail-closed."""
    if signature is None:
        return VerificationResult(valid=False, reason="attestation is unsigned")
    return _verify_signed(payload, signature, public_key_raw)


def _verify_signed(
    payload: AttestationPayload, signature: str, public_key_raw: bytes
) -> VerificationResult:
    """Run the ed25519 verifier and normalize its raise/None contract to a result."""
    verifier = Ed25519Verifier.from_public_bytes(public_key_raw)
    try:
        verifier.verify(canonical_payload_bytes(payload), signature)
    except SignatureError as exc:
        return VerificationResult(valid=False, reason=f"verification failed: {exc}")
    return VerificationResult(valid=True, reason="signature verified")
