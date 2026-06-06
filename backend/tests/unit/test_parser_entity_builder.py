"""Unit tests for the shared canonical-entity builder used by list parsers."""

from datetime import date

from aml_filter.ingest.parsers._build import EntityFields, build_entity, parse_year_or_date


def test_should_build_entity_with_normalized_name_fields() -> None:
    # Given a primary name
    # When building a canonical entity
    entity = build_entity(
        EntityFields(
            entity_id="eu:1",
            entity_type="PERSON",
            primary_name="Dr John Smith",
            source_list="EU_CONSOLIDATED",
            version="2025-01-01",
        )
    )
    # Then the normalized name fields are populated (title stripped by normalizer)
    assert entity.primary_name == "Dr John Smith"
    assert entity.name_canonical == "john smith"
    assert entity.name_tokens == ["john", "smith"]
    assert entity.name_trigram == "john smith"
    assert entity.risk_category == "SANCTION"


def test_should_default_unknown_primary_name_when_blank() -> None:
    # Given an empty primary name
    # When building an entity
    entity = build_entity(
        EntityFields(
            entity_id="eu:2",
            entity_type="ORGANIZATION",
            primary_name="   ",
            source_list="EU_CONSOLIDATED",
            version="v1",
        )
    )
    # Then a non-empty placeholder name is used (Entity requires min_length=1)
    assert entity.primary_name == "UNKNOWN"
    assert entity.name_canonical == "unknown"


def test_should_parse_full_iso_date() -> None:
    # Given an ISO date string
    # When parsing it
    # Then a date is returned
    assert parse_year_or_date("1975-08-21") == date(1975, 8, 21)


def test_should_parse_bare_year() -> None:
    # Given a bare year
    # When parsing it
    # Then Jan 1 of that year is returned
    assert parse_year_or_date("1962") == date(1962, 1, 1)


def test_should_return_none_for_unparseable_date() -> None:
    # Given junk
    # When parsing it
    # Then None is returned (caller drops it)
    assert parse_year_or_date("circa 1980") is None
