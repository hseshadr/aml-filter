"""Unit tests for the generic sanctions-list parser interface and registry."""

import pytest

from aml_filter.ingest.parsers.base import (
    ParserNotRegisteredError,
    SanctionsListParser,
    get_parser,
    parser_for,
    registered_list_ids,
)
from aml_filter.ingest.parsers.ofac import OFACParser


def test_should_expose_ofac_parser_via_registry_when_list_id_is_ofac_sdn() -> None:
    # Given the OFAC list id
    list_id = "OFAC_SDN"
    # When resolving its parser from the registry
    parser = get_parser(list_id)
    # Then the OFAC parser is returned
    assert isinstance(parser, OFACParser)


def test_should_raise_when_resolving_an_unregistered_list_id() -> None:
    # Given a list id no parser is registered for
    list_id = "NOT_A_REAL_LIST"
    # When resolving its parser
    # Then a typed error is raised (fail-closed, no silent fallback)
    with pytest.raises(ParserNotRegisteredError):
        get_parser(list_id)


def test_should_list_all_registered_list_ids() -> None:
    # Given the default registry
    # When listing registered ids
    ids = registered_list_ids()
    # Then the four built-in sanctions lists are present
    assert {"OFAC_SDN", "EU_CONSOLIDATED", "UK_OFSI", "UN_CONSOLIDATED"} <= set(ids)


def test_ofac_parser_satisfies_the_protocol() -> None:
    # Given an OFAC parser instance
    parser = OFACParser()
    # When checking it against the structural protocol
    # Then it satisfies SanctionsListParser
    assert isinstance(parser, SanctionsListParser)


def test_parser_for_decorator_registers_a_parser() -> None:
    # Given a freshly registered parser via the decorator
    @parser_for("TEST_LIST_REG")
    class _Dummy:
        list_id = "TEST_LIST_REG"

        def parse(self, raw: str | bytes) -> list[object]:
            return []

    # When resolving it
    parser = get_parser("TEST_LIST_REG")
    # Then the registered instance is returned
    assert isinstance(parser, _Dummy)
