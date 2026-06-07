"""UK OFSI consolidated sanctions list parser.

Models the UK HM Treasury / OFSI consolidated list in its published **XML** machine
format (namespace ``http://www.hm-treasury.gov.uk/2008/03/UNSC``). OFSI publishes the
list as both CSV and XML; the XML is chosen here because it carries the structured
sub-fields (name parts, DOBs, nationalities, identifiers) without the CSV's flattened
"all names in one cell" ambiguity.

Schema notes / assumptions: each ``<Designation>`` has a ``<GroupID>``,
a ``<GroupTypeDescription>`` (``Individual`` / ``Entity`` / ``Ship``), and ``<Names>``.
OFSI name parts are ``Name1``..``Name5`` (forenames) and ``Name6`` (family name); the
primary name is the ``NameType == "Primary name"`` entry, others (``aka``) become
aliases. Individuals carry ``<DOBs>``, ``<Nationalities>``, ``<Passports>`` and
``<NationalIdentificationNumbers>``.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET  # type-only; parsing uses defusedxml below
from datetime import date
from typing import Literal

from defusedxml.ElementTree import fromstring as defused_fromstring

from aml_filter.domain.entity import Alias, Entity, EntityIdentifier
from aml_filter.ingest.parsers._build import (
    EntityFields,
    build_alias,
    build_entity,
    decode_raw,
    join_fields,
    non_empty,
    parse_dates,
)
from aml_filter.ingest.parsers.base import parser_for

_NS = {"uk": "http://www.hm-treasury.gov.uk/2008/03/UNSC"}
_LIST_ID = "UK_OFSI"
_FORENAME_TAGS = ("uk:Name1", "uk:Name2", "uk:Name3", "uk:Name4", "uk:Name5")


@parser_for(_LIST_ID)
class UKOFSIParser:
    """Parser for the UK OFSI consolidated sanctions XML."""

    list_id = _LIST_ID

    def parse(self, raw: str | bytes) -> list[Entity]:
        """Parse the OFSI consolidated XML into canonical entities."""
        root = defused_fromstring(decode_raw(raw))  # defusedxml — XXE / billion-laughs protection
        version = root.get("GenerationDate", "") or "unknown"
        parsed = (self._parse_designation(node, version) for node in self._designations(root))
        return [entity for entity in parsed if entity is not None]

    def _designations(self, root: ET.Element) -> list[ET.Element]:
        """Return every ``<Designation>`` node."""
        return root.findall(".//uk:Designation", _NS)

    def _parse_designation(self, node: ET.Element, version: str) -> Entity | None:
        """Convert one ``<Designation>`` into a canonical entity."""
        group_id = self._text(node, "uk:GroupID")
        names = node.findall(".//uk:Names/uk:Name", _NS)
        primary = self._primary_name(names)
        if not group_id or not primary:
            return None
        return build_entity(
            EntityFields(
                entity_id=f"uk:{group_id}",
                entity_type=self._entity_type(node),
                primary_name=primary,
                source_list=_LIST_ID,
                version=version,
                aliases=self._aliases(names, primary),
                dob=self._dobs(node),
                nationalities=self._nationalities(node),
                addresses=self._addresses(node),
                identifiers=self._identifiers(node),
                raw_source={"GroupID": group_id},
            )
        )

    def _primary_name(self, names: list[ET.Element]) -> str:
        """Pick the ``Primary name`` entry, else the first name."""
        primaries = [n for n in names if self._text(n, "uk:NameType") == "Primary name"]
        chosen = primaries or names
        return self._full_name(chosen[0]) if chosen else ""

    def _full_name(self, name_node: ET.Element) -> str:
        """Join forenames (Name1..5) + family name (Name6)."""
        forenames = [self._text(name_node, tag) for tag in _FORENAME_TAGS]
        parts = [*forenames, self._text(name_node, "uk:Name6")]
        return " ".join(part for part in parts if part)

    def _entity_type(self, node: ET.Element) -> Literal["PERSON", "ORGANIZATION"]:
        """Map ``GroupTypeDescription`` to PERSON / ORGANIZATION."""
        return (
            "PERSON"
            if self._text(node, "uk:GroupTypeDescription") == "Individual"
            else "ORGANIZATION"
        )

    def _aliases(self, names: list[ET.Element], primary: str) -> list[Alias]:
        """Every non-primary name becomes an alias."""
        built = (build_alias(self._full_name(n), "UK_OFSI") for n in names)
        return [a for a in built if a is not None and a.name != primary]

    def _dobs(self, node: ET.Element) -> list[date]:
        """Parse all ``<DOB>`` values."""
        return parse_dates(self._text(d, "uk:DOB") for d in node.findall(".//uk:DOBs/uk:DOB", _NS))

    def _nationalities(self, node: ET.Element) -> list[str]:
        """Collect nationality values (OFSI publishes country names, not ISO codes)."""
        return non_empty(
            n.text or "" for n in node.findall(".//uk:Nationalities/uk:Nationality", _NS)
        )

    def _addresses(self, node: ET.Element) -> list[str]:
        """Join populated address sub-fields into comma-separated lines."""
        tags = ("uk:AddressLine1", "uk:AddressCity", "uk:AddressCountry")
        nodes = node.findall(".//uk:Addresses/uk:Address", _NS)
        lines = (join_fields(self._text(a, t) for t in tags) for a in nodes)
        return [line for line in lines if line]

    def _identifiers(self, node: ET.Element) -> EntityIdentifier:
        """Collect passports and national identification numbers."""
        return EntityIdentifier(
            passport=self._collect(node, ".//uk:Passports/uk:Passport"),
            national_id=self._collect(
                node, ".//uk:NationalIdentificationNumbers/uk:NationalIdentificationNumber"
            ),
        )

    def _collect(self, node: ET.Element, path: str) -> list[str]:
        """Collect non-empty stripped texts under ``path``."""
        return [el.text.strip() for el in node.findall(path, _NS) if el.text and el.text.strip()]

    @staticmethod
    def _text(parent: ET.Element, tag: str) -> str:
        """Return stripped text of ``parent/tag`` or empty string."""
        elem = parent.find(tag, _NS)
        return elem.text.strip() if elem is not None and elem.text else ""
