"""Unit tests for the EU consolidated sanctions list parser."""

from pathlib import Path

import pytest

from aml_filter.ingest.parsers.eu import EUConsolidatedParser

_FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "eu_consolidated_sample.xml"


@pytest.fixture
def parser() -> EUConsolidatedParser:
    return EUConsolidatedParser()


@pytest.fixture
def entities(parser: EUConsolidatedParser) -> list:
    return parser.parse(_FIXTURE.read_bytes())


def test_should_parse_two_entities_from_fixture(entities: list) -> None:
    # Given the EU fixture (one person, one enterprise)
    # When parsed
    # Then exactly two entities are returned
    assert len(entities) == 2


def test_should_map_person_subject_type_to_person(entities: list) -> None:
    # Given the first entity (subjectType code="person")
    # Then it is a PERSON with the strong name as primary
    person = entities[0]
    assert person.entity_type == "PERSON"
    assert person.primary_name == "Ivan Petrov"
    assert person.entity_id == "eu:13"


def test_should_map_enterprise_subject_type_to_organization(entities: list) -> None:
    # Given the second entity (subjectType code="enterprise")
    org = entities[1]
    assert org.entity_type == "ORGANIZATION"
    assert org.primary_name == "Volga Trading LLC"


def test_should_collect_weaker_name_aliases(entities: list) -> None:
    # Given the person has a second nameAlias
    person = entities[0]
    # Then it appears as an alias (the primary is excluded)
    alias_names = {a.name for a in person.aliases}
    assert "Vanya Petrov" in alias_names


def test_should_map_birthdate_and_citizenship(entities: list) -> None:
    # Given the person's birthdate and citizenship
    from datetime import date

    person = entities[0]
    assert date(1971, 3, 9) in person.dob
    assert "RU" in person.nationalities


def test_should_map_identifiers_by_type(entities: list) -> None:
    # Given the person's passport and national_id identifications
    person = entities[0]
    assert "71 1234567" in person.identifiers.passport
    assert "RU-99887766" in person.identifiers.national_id


def test_should_fail_closed_on_malformed_xml(parser: EUConsolidatedParser) -> None:
    # Given malformed XML
    # When parsing
    # Then it raises rather than returning a partial result
    with pytest.raises(Exception):
        parser.parse(b"<export><sanctionEntity></broken>")
