"""Screening attestation (review badge) domain models.

Typed Pydantic models for the periodic-attestation tier. An attestation is a
verifiable record that a customer was screened against the enabled lists at
specific versions, on a date, with a result (clear, or N matches dispositioned /
pending). The :class:`AttestationPayload` is the exact, canonically-serialized
object that gets ed25519-signed, so a badge is independently verifiable.

The payload serialization is deterministic (sorted list-version entries, fixed
field order, UTC ISO-8601 timestamps) so a re-derived payload byte-matches the
signed original and the signature verifies.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class AttestationStatus(StrEnum):
    """Result classification of a customer's screening attestation."""

    CLEAR = "CLEAR"
    MATCHES_PENDING = "MATCHES_PENDING"
    MATCHES_DISPOSITIONED = "MATCHES_DISPOSITIONED"


class ListVersionEntry(BaseModel):
    """One enabled list and the version it was screened against."""

    model_config = ConfigDict(frozen=True)

    list_id: str = Field(..., min_length=1, max_length=100)
    version: str = Field(..., min_length=1, max_length=50)


class ResultSummary(BaseModel):
    """The screening outcome for a customer at attestation time."""

    model_config = ConfigDict(frozen=True)

    status: AttestationStatus
    match_count: int = Field(..., ge=0)
    pending_count: int = Field(..., ge=0)


class AttestationPayload(BaseModel):
    """The exact object that is canonically serialized and ed25519-signed.

    Two attestations with identical screened scope + result produce byte-identical
    canonical payloads, so a signature over one verifies a faithful re-derivation.
    """

    model_config = ConfigDict(frozen=True)

    tenant_id: str = Field(..., min_length=1, max_length=100)
    customer_id: str = Field(..., min_length=1, max_length=36)
    customer_reference: str = Field(..., min_length=1, max_length=200)
    screened_at: datetime
    valid_until: datetime
    lists_and_versions: list[ListVersionEntry] = Field(default_factory=list)
    result: ResultSummary


class AttestationRecord(BaseModel):
    """A persisted attestation, read model for the API."""

    model_config = ConfigDict(from_attributes=True)

    attestation_id: str
    tenant_id: str
    customer_id: str
    customer_reference: str
    screened_at: datetime
    valid_until: datetime
    lists_and_versions: list[ListVersionEntry]
    result: ResultSummary
    signature: str | None
    signing_key_id: str | None
    algo: str | None
    created_at: datetime
