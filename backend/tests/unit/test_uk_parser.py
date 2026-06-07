"""Unit tests for the UK OFSI consolidated sanctions list parser."""

from datetime import date
from pathlib import Path

import pytest

from aml_filter.ingest.parsers.uk import UKOFSIParser

_FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "uk_ofsi_sample.xml"


@pytest.fixture
def parser() -> UKOFSIParser:
    return UKOFSIParser()


@pytest.fixture
def entities(parser: UKOFSIParser) -> list:
    return parser.parse(_FIXTURE.read_bytes())


def test_should_parse_two_designations(entities: list) -> None:
    # Given the UK fixture (one individual, one entity)
    assert len(entities) == 2


def test_should_map_individual_to_person_with_joined_name(entities: list) -> None:
    # Given the individual designation (GroupID 7001)
    person = entities[0]
    assert person.entity_type == "PERSON"
    assert person.primary_name == "Ali Hassan"
    assert person.entity_id == "uk:7001"


def test_should_map_entity_group_type_to_organization(entities: list) -> None:
    # Given the entity designation (GroupID 7002)
    org = entities[1]
    assert org.entity_type == "ORGANIZATION"
    assert org.primary_name == "Desert Logistics Ltd"


def test_should_collect_aka_names_as_aliases(entities: list) -> None:
    # Given the individual has an 'aka' name
    person = entities[0]
    assert any(a.name == "Ali Hasan" for a in person.aliases)


def test_should_map_dob_nationality_and_identifiers(entities: list) -> None:
    # Given the individual's DOB, nationality, passport, national id
    person = entities[0]
    assert date(1965, 7, 12) in person.dob
    assert "Iraq" in person.nationalities
    assert "IQ-44455" in person.identifiers.passport
    assert "NID-7788" in person.identifiers.national_id


def test_should_fail_closed_on_malformed_xml(parser: UKOFSIParser) -> None:
    # Given malformed XML
    with pytest.raises(Exception):
        parser.parse(b"<ConsolidatedList><Designation></broken>")
