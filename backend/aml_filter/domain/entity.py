"""Entity domain models for AML screening."""

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field


class Alias(BaseModel):
    """Entity alias information."""

    name: str = Field(..., min_length=1, max_length=500)
    name_canonical: str = Field(..., min_length=1, max_length=500)
    source: str = Field(..., max_length=100)


class EntityIdentifier(BaseModel):
    """Entity identifier (passport, national ID, etc.)."""

    passport: list[str] = Field(default_factory=list)
    national_id: list[str] = Field(default_factory=list)
    other: dict[str, list[str]] = Field(default_factory=dict)


class Entity(BaseModel):
    """Canonical entity model for all screened entities."""

    entity_id: str = Field(..., min_length=1, max_length=500)
    tenant_id: str | None = Field(None, max_length=100)
    entity_type: Literal["PERSON", "ORGANIZATION"] = Field(...)
    primary_name: str = Field(..., min_length=1, max_length=500)
    name_canonical: str = Field(..., min_length=1, max_length=500)
    name_tokens: list[str] = Field(default_factory=list)
    name_trigram: str = Field(..., min_length=1, max_length=500)
    aliases: list[Alias] = Field(default_factory=list)
    dob: list[date] = Field(default_factory=list)
    countries: list[str] = Field(default_factory=list, max_length=2)  # ISO 3166-1 alpha-2
    nationalities: list[str] = Field(default_factory=list, max_length=2)
    addresses: list[str] = Field(default_factory=list)
    identifiers: EntityIdentifier = Field(default_factory=EntityIdentifier)
    risk_category: Literal["SANCTION", "PEP", "CUSTOM", "WHITELIST"] = Field(...)
    source_list: str = Field(..., min_length=1, max_length=100)
    list_version: str = Field(..., min_length=1, max_length=50)
    custom_list_id: str | None = Field(None, max_length=200)
    raw_source: dict[str, Any] = Field(default_factory=dict)
