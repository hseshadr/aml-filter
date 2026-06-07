"""Suspicious Activity Report (SAR) domain models.

Typed Pydantic models for the SAR filing layer that sits on top of the screening
engine. A SAR is generated for a customer who is a STRONG match to a sanctioned
entity. The design is jurisdiction-agnostic: ``SarJurisdiction`` + ``SarTemplate``
select a pluggable renderer, while the record shape is shared across jurisdictions.

The ``SubjectSnapshot`` is a denormalized, immutable capture of the customer and the
matched sanctioned entity *at filing time*, so the SAR stays fileable and accurate
even if the customer record later changes.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class SarJurisdiction(StrEnum):
    """Filing jurisdiction for a SAR (selects a renderer family)."""

    US = "US"
    UK = "UK"
    AU = "AU"


class SarTemplate(StrEnum):
    """Report template / form layout for a SAR (selects a concrete renderer)."""

    FINCEN = "FINCEN"


class SarStatus(StrEnum):
    """Lifecycle state of a SAR record."""

    DRAFT = "DRAFT"
    COMPLETED = "COMPLETED"
    EXPORTED = "EXPORTED"


class SubjectSnapshot(BaseModel):
    """Immutable capture of the SAR subject + match basis at filing time."""

    model_config = ConfigDict(frozen=True)

    customer_reference: str = Field(..., min_length=1, max_length=200)
    customer_name: str = Field(..., min_length=1, max_length=500)
    customer_dob: list[date] = Field(default_factory=list)
    customer_identifiers: list[str] = Field(default_factory=list)
    matched_sanctioned_name: str = Field(..., min_length=1, max_length=500)
    matched_source_list: str = Field(..., min_length=1, max_length=100)
    match_score: float = Field(..., ge=0.0, le=1.0)
    match_tier: str = Field(..., min_length=1, max_length=20)


class Filer(BaseModel):
    """The institution / person filing the SAR."""

    model_config = ConfigDict(frozen=True)

    name: str = Field(..., min_length=1, max_length=200)
    institution: str = Field(..., min_length=1, max_length=300)
    contact: str = Field(..., min_length=1, max_length=300)


class SarRecord(BaseModel):
    """A persisted SAR, read model shared across jurisdictions."""

    model_config = ConfigDict(from_attributes=True)

    sar_id: str
    tenant_id: str
    customer_id: str
    match_id: str
    jurisdiction: SarJurisdiction
    template: SarTemplate
    subject: SubjectSnapshot
    suspicious_activity_narrative: str | None
    filer: Filer
    status: SarStatus
    created_by: str
    created_at: datetime
    updated_at: datetime
    filed_at: datetime | None
