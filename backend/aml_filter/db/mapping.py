"""Mapping between SQLAlchemy DB models and Pydantic domain models."""

from datetime import date
from typing import Literal, NamedTuple

from aml_filter.db.models import Entity as DBEntity
from aml_filter.domain.entity import Alias, Entity, EntityIdentifier


class _Locations(NamedTuple):
    """Non-null location list fields lifted off a DB entity."""

    dob: list[date]
    countries: list[str]
    nationalities: list[str]
    addresses: list[str]


EntityType = Literal["PERSON", "ORGANIZATION"]
RiskCategory = Literal["SANCTION", "PEP", "CUSTOM", "WHITELIST"]


def safe_entity_type(val: str | None) -> EntityType:
    """Coerce a string to an EntityType, defaulting to PERSON."""
    if val and val.upper() in ("PERSON", "ORGANIZATION"):
        return val.upper()  # type: ignore[return-value]
    return "PERSON"


def safe_risk_category(val: str | None) -> RiskCategory:
    """Coerce a string to a RiskCategory, defaulting to SANCTION."""
    if val and val.upper() in ("SANCTION", "PEP", "CUSTOM", "WHITELIST"):
        return val.upper()  # type: ignore[return-value]
    return "SANCTION"


def _parse_aliases(db_entity: DBEntity) -> list[Alias]:
    """Validate JSONB alias records into typed Alias models, skipping invalid ones."""
    aliases: list[Alias] = []
    for record in db_entity.aliases or []:
        if isinstance(record, dict):
            aliases.append(Alias.model_validate(record))
    return aliases


def _location_fields(db_entity: DBEntity) -> _Locations:
    """Resolve the nullable list columns (dob/countries/etc.) to non-null lists."""
    return _Locations(
        dob=db_entity.dob or [],
        countries=db_entity.countries or [],
        nationalities=db_entity.nationalities or [],
        addresses=db_entity.addresses or [],
    )


def db_to_domain_entity(db_entity: DBEntity) -> Entity:
    """Convert a SQLAlchemy Entity row into a validated domain Entity."""
    loc = _location_fields(db_entity)
    return Entity(
        entity_id=db_entity.entity_id,
        tenant_id=db_entity.tenant_id,
        entity_type=safe_entity_type(db_entity.entity_type),
        primary_name=db_entity.primary_name,
        name_canonical=db_entity.name_canonical,
        name_tokens=db_entity.name_tokens or [],
        name_trigram=db_entity.name_trigram,
        aliases=_parse_aliases(db_entity),
        dob=loc.dob,
        countries=loc.countries,
        nationalities=loc.nationalities,
        addresses=loc.addresses,
        identifiers=EntityIdentifier.model_validate(db_entity.identifiers or {}),
        risk_category=safe_risk_category(db_entity.risk_category),
        source_list=db_entity.source_list,
        list_version=db_entity.list_version,
        custom_list_id=db_entity.custom_list_id,
        raw_source=db_entity.raw_source or {},
    )
