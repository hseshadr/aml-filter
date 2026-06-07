"""Unit tests for the UN consolidated sanctions list parser."""

from datetime import date
from pathlib import Path

import pytest

from aml_filter.ingest.parsers.un import UNConsolidatedParser

_FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "un_consolidated_sample.xml"


@pytest.fixture
def parser() -> UNConsolidatedParser:
    return UNConsolidatedParser()


@pytest.fixture
def entities(parser: UNConsolidatedParser) -> list:
    return parser.parse(_FIXTURE.read_bytes())


def test_should_parse_one_individual_and_one_entity(entities: list) -> None:
    # Given the UN fixture (one INDIVIDUAL, one ENTITY)
    assert len(entities) == 2


def test_should_map_individual_to_person_with_joined_name(entities: list) -> None:
    # Given the INDIVIDUAL (DATAID 6908001)
    person = next(e for e in entities if e.entity_type == "PERSON")
    assert person.primary_name == "MOHAMMED OMAR AL FULANI"
    assert person.entity_id == "un:6908001"


def test_should_map_entity_to_organization(entities: list) -> None:
    # Given the ENTITY (DATAID 6908100)
    org = next(e for e in entities if e.entity_type == "ORGANIZATION")
    assert org.primary_name == "HORIZON RELIEF FOUNDATION"
    assert org.entity_id == "un:6908100"


def test_should_collect_alias_names(entities: list) -> None:
    # Given the individual's INDIVIDUAL_ALIAS
    person = next(e for e in entities if e.entity_type == "PERSON")
    assert any(a.name == "Mohammed Omar Fulani" for a in person.aliases)


def test_should_map_dob_nationality_and_documents(entities: list) -> None:
    # Given the individual's DOB, nationality, and documents
    person = next(e for e in entities if e.entity_type == "PERSON")
    assert date(1968, 1, 1) in person.dob
    assert "Afghanistan" in person.nationalities
    assert "AF-0099" in person.identifiers.passport
    assert "NID-321" in person.identifiers.national_id


def test_should_fail_closed_on_malformed_xml(parser: UNConsolidatedParser) -> None:
    # Given malformed XML
    with pytest.raises(Exception):
        parser.parse(b"<CONSOLIDATED_LIST><INDIVIDUALS></broken>")
