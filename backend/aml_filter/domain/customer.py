"""KYC customer domain models.

Typed Pydantic models for the customer onboarding layer that sits on top of the
screening engine. Enums are string-valued so they serialize cleanly to JSON and
map onto the ``String`` columns used elsewhere in the data model.
"""

from __future__ import annotations

from datetime import date
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class OnboardingStatus(StrEnum):
    """Lifecycle state of a customer onboarding."""

    DRAFT = "DRAFT"
    PENDING_REVIEW = "PENDING_REVIEW"
    ACTIVE = "ACTIVE"
    REJECTED = "REJECTED"


class KycRiskRating(StrEnum):
    """Assessed KYC risk band for a customer."""

    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class IdDocument(BaseModel):
    """A single identity document supplied during onboarding."""

    model_config = ConfigDict(frozen=True)

    doc_type: str = Field(..., min_length=1, max_length=50)
    number: str = Field(..., min_length=1, max_length=100)
    issuing_country: str = Field(..., min_length=2, max_length=2)
    expiry: date | None = Field(default=None)


class OnboardingResult(BaseModel):
    """Typed result of an onboarding run, including any screening matches."""

    customer_id: str
    customer_reference: str
    screening_entity_id: str
    onboarding_status: OnboardingStatus
    match_entity_ids: list[str] = Field(default_factory=list)

    @property
    def match_count(self) -> int:
        """Number of sanctions matches found during onboarding screening."""
        return len(self.match_entity_ids)

    @property
    def has_matches(self) -> bool:
        """True when onboarding screening surfaced at least one match."""
        return bool(self.match_entity_ids)
