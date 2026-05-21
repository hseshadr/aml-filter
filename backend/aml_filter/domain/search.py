"""Search query and response domain models."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class SearchQuery(BaseModel):
    """Query for entity screening."""

    name: str = Field(..., min_length=1, max_length=500)
    dob: date | None = None
    country: str | None = Field(None, min_length=2, max_length=2)
    entity_type: Literal["PERSON", "ORGANIZATION"] | None = None
    threshold: float = Field(0.65, ge=0.0, le=1.0)
    k: int = Field(20, ge=1, le=100)
    lists: list[str] | None = None
    policy_id: str | None = None


class MatchReason(BaseModel):
    """Explanation reason for a match."""

    signal: str = Field(..., min_length=1)
    value: float | str = Field(...)
    weight: float | None = Field(None, ge=0.0, le=1.0)
    contribution: float | None = Field(None, ge=0.0, le=1.0)
    description: str | None = None


class Match(BaseModel):
    """A matched entity with score and explanation."""

    entity_id: str = Field(..., min_length=1)
    score: float = Field(..., ge=0.0, le=1.0)
    risk_category: Literal["SANCTION", "PEP", "CUSTOM", "WHITELIST"] = Field(...)
    source_list: str = Field(..., min_length=1)
    list_version: str = Field(..., min_length=1)
    primary_name: str = Field(..., min_length=1)
    aliases: list[str] = Field(default_factory=list)
    countries: list[str] = Field(default_factory=list)
    dob: list[date] = Field(default_factory=list)
    reasons: list[MatchReason] = Field(default_factory=list)
    explanation: str = Field(..., min_length=1)


class SearchResponse(BaseModel):
    """Response from entity screening."""

    request_id: str = Field(..., min_length=1)
    matches: list[Match] = Field(default_factory=list)
    list_versions_used: dict[str, str] = Field(default_factory=dict)
    execution_time_ms: int | None = Field(None, ge=0)


class SearchFilters(BaseModel):
    """Filters for search queries."""

    source_lists: list[str] | None = None
    risk_categories: list[Literal["SANCTION", "PEP", "CUSTOM", "WHITELIST"]] | None = None
    entity_types: list[Literal["PERSON", "ORGANIZATION"]] | None = None
