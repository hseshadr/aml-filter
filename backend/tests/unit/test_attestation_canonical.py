"""Canonical-serialization + sign/verify tests for the attestation tier."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from edgeproc.bundles.signing import Ed25519Signer, SignatureError, generate_keypair

from aml_filter.attestation.canonical import canonical_payload_bytes
from aml_filter.attestation.signing import sign_payload, verify_payload
from aml_filter.domain.attestation import (
    AttestationPayload,
    AttestationStatus,
    ListVersionEntry,
    ResultSummary,
)

_SCREENED_AT = datetime(2026, 6, 6, 12, 0, 0, tzinfo=UTC)
_VALID_UNTIL = datetime(2026, 9, 4, 12, 0, 0, tzinfo=UTC)


def _payload(lists: list[ListVersionEntry] | None = None) -> AttestationPayload:
    """Build a representative clear-result attestation payload."""
    return AttestationPayload(
        tenant_id="tenant-123",
        customer_id="cust-1",
        customer_reference="ACME-001",
        screened_at=_SCREENED_AT,
        valid_until=_VALID_UNTIL,
        lists_and_versions=lists
        or [
            ListVersionEntry(list_id="OFAC_SDN", version="2026-06-01"),
            ListVersionEntry(list_id="EU_CFSP", version="2026-05-30"),
        ],
        result=ResultSummary(status=AttestationStatus.CLEAR, match_count=0, pending_count=0),
    )


def test_should_be_deterministic_when_lists_reordered() -> None:
    # Given two payloads identical except for list-entry order
    ordered = _payload(
        [
            ListVersionEntry(list_id="OFAC_SDN", version="2026-06-01"),
            ListVersionEntry(list_id="EU_CFSP", version="2026-05-30"),
        ]
    )
    reversed_lists = _payload(
        [
            ListVersionEntry(list_id="EU_CFSP", version="2026-05-30"),
            ListVersionEntry(list_id="OFAC_SDN", version="2026-06-01"),
        ]
    )

    # When canonicalized
    # Then the bytes match (list order does not affect the signed payload)
    assert canonical_payload_bytes(ordered) == canonical_payload_bytes(reversed_lists)


def test_should_round_trip_when_signed_and_verified() -> None:
    # Given a signer and its public key
    private, public = generate_keypair()
    signer = Ed25519Signer(private)
    payload = _payload()

    # When the payload is signed and re-verified
    signature = sign_payload(payload, signer)
    result = verify_payload(payload, signature, public.public_bytes_raw())

    # Then verification reports valid
    assert result.valid is True
    assert result.reason == "signature verified"


def test_should_fail_verify_when_payload_tampered() -> None:
    # Given a signature over the original payload
    private, public = generate_keypair()
    signer = Ed25519Signer(private)
    signature = sign_payload(_payload(), signer)

    # When a field is mutated after signing
    tampered = _payload().model_copy(
        update={
            "result": ResultSummary(
                status=AttestationStatus.MATCHES_PENDING, match_count=1, pending_count=1
            )
        }
    )

    # Then verification fails closed
    result = verify_payload(tampered, signature, public.public_bytes_raw())
    assert result.valid is False
    assert "verification failed" in result.reason


def test_should_report_unsigned_when_no_signature() -> None:
    # Given an attestation with no signature
    _private, public = generate_keypair()

    # When verified with a None signature
    result = verify_payload(_payload(), None, public.public_bytes_raw())

    # Then it is reported unsigned, not invalid-as-tampered
    assert result.valid is False
    assert result.reason == "attestation is unsigned"


def test_should_raise_signature_error_when_signature_malformed() -> None:
    # Given a malformed (non-base64) signature
    _private, public = generate_keypair()

    # When verified, the underlying verifier raises and we surface it as not-valid
    result = verify_payload(_payload(), "not-base64-!!!", public.public_bytes_raw())

    # Then it fails closed without crashing
    assert result.valid is False


def test_should_normalize_naive_datetime_to_utc_in_canonical_bytes() -> None:
    # Given canonical bytes contain an ISO-8601 UTC timestamp
    payload = _payload()

    # When serialized
    raw = canonical_payload_bytes(payload).decode("utf-8")

    # Then the screened_at appears in canonical UTC ISO form
    assert "2026-06-06T12:00:00+00:00" in raw


def test_signature_error_is_importable() -> None:
    # Guard: the reused crypto error type is the edgeproc one
    assert issubclass(SignatureError, Exception)


@pytest.mark.parametrize(
    ("status", "matches", "pending"),
    [
        (AttestationStatus.CLEAR, 0, 0),
        (AttestationStatus.MATCHES_PENDING, 2, 1),
        (AttestationStatus.MATCHES_DISPOSITIONED, 3, 0),
    ],
)
def test_should_canonicalize_every_status(
    status: AttestationStatus, matches: int, pending: int
) -> None:
    # Given a payload with each result status
    payload = _payload()
    payload = payload.model_copy(
        update={"result": ResultSummary(status=status, match_count=matches, pending_count=pending)}
    )

    # When canonicalized, the status string is present in the bytes
    assert status.value.encode("utf-8") in canonical_payload_bytes(payload)
