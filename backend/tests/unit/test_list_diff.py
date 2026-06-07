"""Unit tests for the sanctions-list diff (added / modified / removed)."""

from __future__ import annotations

from datetime import date

import pytest

from aml_filter.domain.entity import Alias, Entity
from aml_filter.ingest.diff import ListDiff, diff_lists

pytestmark = pytest.mark.unit


def _entity(entity_id: str, name: str, *, dob: list[date] | None = None) -> Entity:
    """Build a minimal sanctions Entity for diff tests."""
    canonical = name.lower()
    return Entity(
        entity_id=entity_id,
        entity_type="PERSON",
        primary_name=name,
        name_canonical=canonical,
        name_trigram=canonical,
        aliases=[],
        dob=dob or [],
        risk_category="SANCTION",
        source_list="OFAC_SDN",
        list_version="v2",
    )


def test_identical_lists_produce_empty_diff() -> None:
    old = [_entity("a", "Alice Smith"), _entity("b", "Bob Jones")]
    new = [_entity("a", "Alice Smith"), _entity("b", "Bob Jones")]

    result = diff_lists(old, new)

    assert result == ListDiff(added=[], modified=[], removed=[])


def test_added_entry_is_reported_as_added() -> None:
    old = [_entity("a", "Alice Smith")]
    new = [_entity("a", "Alice Smith"), _entity("c", "Carol Lee")]

    result = diff_lists(old, new)

    assert [e.entity_id for e in result.added] == ["c"]
    assert result.modified == []
    assert result.removed == []


def test_removed_entry_is_reported_as_removed() -> None:
    old = [_entity("a", "Alice Smith"), _entity("b", "Bob Jones")]
    new = [_entity("a", "Alice Smith")]

    result = diff_lists(old, new)

    assert result.removed == ["b"]
    assert result.added == []
    assert result.modified == []


def test_changed_name_is_reported_as_modified() -> None:
    old = [_entity("a", "Alice Smith")]
    new = [_entity("a", "Alice Smithe")]

    result = diff_lists(old, new)

    assert [e.entity_id for e in result.modified] == ["a"]
    assert result.added == []
    assert result.removed == []


def test_changed_dob_is_reported_as_modified() -> None:
    old = [_entity("a", "Alice Smith", dob=[date(1980, 1, 1)])]
    new = [_entity("a", "Alice Smith", dob=[date(1981, 2, 2)])]

    result = diff_lists(old, new)

    assert [e.entity_id for e in result.modified] == ["a"]


def test_changed_alias_is_reported_as_modified() -> None:
    old = [_entity("a", "Alice Smith")]
    changed = _entity("a", "Alice Smith")
    changed = changed.model_copy(
        update={"aliases": [Alias(name="Ali S", name_canonical="ali s", source="OFAC")]}
    )
    new = [changed]

    result = diff_lists(old, new)

    assert [e.entity_id for e in result.modified] == ["a"]


def test_noncreening_field_change_is_not_modified() -> None:
    """A change to raw_source (not a screening-relevant field) is not a modification."""
    old = [_entity("a", "Alice Smith")]
    changed = _entity("a", "Alice Smith").model_copy(update={"raw_source": {"note": "x"}})
    new = [changed]

    result = diff_lists(old, new)

    assert result.modified == []


def test_diff_is_deterministic_in_id_order() -> None:
    old = [_entity("a", "Alice")]
    new = [_entity("c", "Carol"), _entity("b", "Bob"), _entity("a", "Alice")]

    result = diff_lists(old, new)

    assert [e.entity_id for e in result.added] == ["b", "c"]
