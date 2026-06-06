"""Shared helpers for building canonical entities from list-specific parsers.

Keeps the EU / UK / UN parsers DRY: each one extracts list-specific fields into an
:class:`EntityFields` value object and hands it to :func:`build_entity`, which applies
the same name-normalization pipeline the OFAC parser uses so every list produces
byte-identical canonical name fields.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Literal

from aml_filter.domain.entity import Alias, Entity, EntityIdentifier
from aml_filter.domain.normalization import NormalizedName, normalize_name
from aml_filter.types import JsonObject

_PLACEHOLDER_NAME = "UNKNOWN"
_MAX_COUNTRIES = 2


@dataclass(frozen=True)
class EntityFields:
    """List-specific fields a parser extracts before canonicalization."""

    entity_id: str
    entity_type: Literal["PERSON", "ORGANIZATION"]
    primary_name: str
    source_list: str
    version: str
    aliases: list[Alias] = field(default_factory=list)
    dob: list[date] = field(default_factory=list)
    countries: list[str] = field(default_factory=list)
    nationalities: list[str] = field(default_factory=list)
    addresses: list[str] = field(default_factory=list)
    identifiers: EntityIdentifier = field(default_factory=EntityIdentifier)
    raw_source: JsonObject = field(default_factory=dict)


def build_entity(fields: EntityFields) -> Entity:
    """Assemble a canonical :class:`Entity` from extracted list fields."""
    name = fields.primary_name.strip() or _PLACEHOLDER_NAME
    normalized = normalize_name(name)
    return Entity(
        entity_id=fields.entity_id,
        tenant_id=None,
        entity_type=fields.entity_type,
        primary_name=name,
        name_canonical=_canonical(normalized),
        name_tokens=normalized.name_tokens,
        name_trigram=_canonical(normalized),
        aliases=fields.aliases,
        dob=fields.dob,
        countries=fields.countries[:_MAX_COUNTRIES],
        nationalities=fields.nationalities[:_MAX_COUNTRIES],
        addresses=fields.addresses,
        identifiers=fields.identifiers,
        risk_category="SANCTION",
        source_list=fields.source_list,
        list_version=fields.version,
        custom_list_id=None,
        raw_source=fields.raw_source,
    )


def _canonical(normalized: NormalizedName) -> str:
    """Canonical name string, falling back to the placeholder when empty."""
    return normalized.name_canonical or _PLACEHOLDER_NAME.lower()


def build_alias(name: str, source: str) -> Alias | None:
    """Build an :class:`Alias` from a name, or None when the name is blank."""
    cleaned = name.strip()
    canonical = normalize_name(cleaned).name_canonical
    if not cleaned or not canonical:
        return None
    return Alias(name=cleaned, name_canonical=canonical, source=source)


def parse_year_or_date(value: str) -> date | None:
    """Parse a full ISO date or a bare year string; None if unparseable."""
    cleaned = value.strip()
    for fmt in ("%Y-%m-%d", "%Y"):
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
    return None


def decode_raw(raw: str | bytes) -> str:
    """Decode raw bytes to UTF-8 text (pass through str unchanged)."""
    return raw.decode("utf-8") if isinstance(raw, bytes) else raw


def parse_dates(values: Iterable[str]) -> list[date]:
    """Parse an iterable of date strings, dropping blanks and unparseable values."""
    parsed = (parse_year_or_date(value) for value in values if value)
    return [d for d in parsed if d is not None]


def join_fields(values: Iterable[str]) -> str:
    """Join non-empty field values into a single comma-separated line."""
    return ", ".join(value for value in values if value)


def non_empty(values: Iterable[str]) -> list[str]:
    """Strip and keep only non-empty strings from ``values``."""
    stripped = (value.strip() for value in values)
    return [value for value in stripped if value]
