"""Deterministic canonical serialization of an attestation payload.

The bytes produced here are the *exact* input to the ed25519 signer/verifier. They
must be stable across processes and re-derivations: list-version entries are sorted,
timestamps are normalized to UTC ISO-8601, and JSON keys are emitted in sorted order
with no insignificant whitespace. A faithful re-build of an attestation therefore
yields byte-identical canonical output, so its stored signature still verifies.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from aml_filter.domain.attestation import AttestationPayload, ListVersionEntry
from aml_filter.types import JsonArray, JsonObject


def canonical_payload_bytes(payload: AttestationPayload) -> bytes:
    """Serialize an attestation payload to stable, signable UTF-8 bytes."""
    document = _canonical_document(payload)
    text = json.dumps(document, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return text.encode("utf-8")


def _canonical_document(payload: AttestationPayload) -> JsonObject:
    """Build the ordered, JSON-safe document mirror of the payload."""
    return {
        "tenant_id": payload.tenant_id,
        "customer_id": payload.customer_id,
        "customer_reference": payload.customer_reference,
        "screened_at": _iso_utc(payload.screened_at),
        "valid_until": _iso_utc(payload.valid_until),
        "lists_and_versions": _canonical_lists(payload.lists_and_versions),
        "result": {
            "status": payload.result.status.value,
            "match_count": payload.result.match_count,
            "pending_count": payload.result.pending_count,
        },
    }


def _canonical_lists(entries: list[ListVersionEntry]) -> JsonArray:
    """Sort list-version entries by (list_id, version) for order-independence."""
    ordered = sorted(entries, key=lambda entry: (entry.list_id, entry.version))
    return [{"list_id": entry.list_id, "version": entry.version} for entry in ordered]


def _iso_utc(value: datetime) -> str:
    """Normalize a datetime to a UTC ISO-8601 string (naive is assumed UTC)."""
    aware = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    return aware.astimezone(UTC).isoformat()
