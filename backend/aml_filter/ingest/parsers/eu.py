"""EU consolidated sanctions list parser.

Models the EU Financial Sanctions Database (FSD) consolidated XML export
(namespace ``http://eu.europa.ec/fpi/fsd/export``), published by the European
Commission. Each ``<sanctionEntity>`` carries a ``<subjectType code="...">``
(``person`` / ``enterprise``), one or more ``<nameAlias>`` (the ``strong="true"``
alias is treated as the primary name), ``<birthdate>``, ``<citizenship>``,
``<address>`` and ``<identification>`` elements.

Assumptions (documented because the live schema evolves): the first
``strong="true"`` ``nameAlias`` is the primary name (falling back to the first
alias); ``identificationTypeCode`` of ``passport`` / ``national_id`` map to the
canonical identifier buckets, everything else to ``other`` keyed by its type code.
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

_NS = {"eu": "http://eu.europa.ec/fpi/fsd/export"}
_LIST_ID = "EU_CONSOLIDATED"


@parser_for(_LIST_ID)
class EUConsolidatedParser:
    """Parser for the EU consolidated financial-sanctions XML export."""

    list_id = _LIST_ID

    def parse(self, raw: str | bytes) -> list[Entity]:
        """Parse the EU consolidated XML into canonical entities."""
        root = defused_fromstring(decode_raw(raw))  # defusedxml — XXE / billion-laughs protection
        version = root.get("generationDate", "") or "unknown"
        entities = (self._parse_entity(node, version) for node in self._entities(root))
        return [entity for entity in entities if entity is not None]

    def _entities(self, root: ET.Element) -> list[ET.Element]:
        """Return every ``<sanctionEntity>`` node."""
        return root.findall(".//eu:sanctionEntity", _NS)

    def _parse_entity(self, node: ET.Element, version: str) -> Entity | None:
        """Convert one ``<sanctionEntity>`` into a canonical entity."""
        logical_id = node.get("logicalId")
        names = node.findall("eu:nameAlias", _NS)
        primary = self._primary_name(names)
        if not logical_id or not primary:
            return None
        return build_entity(
            EntityFields(
                entity_id=f"eu:{logical_id}",
                entity_type=self._entity_type(node),
                primary_name=primary,
                source_list=_LIST_ID,
                version=version,
                aliases=self._aliases(names, primary),
                dob=self._birthdates(node),
                nationalities=self._citizenships(node),
                addresses=self._addresses(node),
                identifiers=self._identifiers(node),
                raw_source={
                    "logicalId": logical_id,
                    "euReferenceNumber": node.get("euReferenceNumber"),
                },
            )
        )

    @classmethod
    def _primary_name(cls, names: list[ET.Element]) -> str:
        """Pick the strong alias as primary name, else the first available alias."""
        strong = cls._whole_names(names, strong_only=True)
        candidates = strong or cls._whole_names(names, strong_only=False)
        return candidates[0] if candidates else ""

    @staticmethod
    def _whole_names(names: list[ET.Element], *, strong_only: bool) -> list[str]:
        """Collect non-blank wholeName values, optionally only the strong ones."""
        selected = [n for n in names if not strong_only or n.get("strong") == "true"]
        return non_empty(n.get("wholeName", "") for n in selected)

    @staticmethod
    def _entity_type(node: ET.Element) -> Literal["PERSON", "ORGANIZATION"]:
        """Map ``subjectType@code`` to PERSON / ORGANIZATION."""
        subject = node.find("eu:subjectType", _NS)
        code = subject.get("code", "") if subject is not None else ""
        return "PERSON" if code.lower() == "person" else "ORGANIZATION"

    @staticmethod
    def _aliases(names: list[ET.Element], primary: str) -> list[Alias]:
        """Every nameAlias except the chosen primary becomes an Alias."""
        built = (build_alias(n.get("wholeName", ""), "EU") for n in names)
        return [a for a in built if a is not None and a.name != primary]

    @staticmethod
    def _birthdates(node: ET.Element) -> list[date]:
        """Parse all ``<birthdate>`` values (full date, falling back to year)."""
        raw = (b.get("birthdate") or b.get("year") or "" for b in node.findall("eu:birthdate", _NS))
        return parse_dates(raw)

    @staticmethod
    def _citizenships(node: ET.Element) -> list[str]:
        """Collect ISO-2 citizenship codes."""
        codes = (c.get("countryIso2Code", "") for c in node.findall("eu:citizenship", _NS))
        return [code.upper() for code in codes if code]

    @staticmethod
    def _addresses(node: ET.Element) -> list[str]:
        """Join populated address sub-fields into comma-separated lines."""
        fields = ("street", "city", "countryIso2Code")
        lines = (join_fields(a.get(f, "") for f in fields) for a in node.findall("eu:address", _NS))
        return [line for line in lines if line]

    def _identifiers(self, node: ET.Element) -> EntityIdentifier:
        """Bucket ``<identification>`` numbers by their type code."""
        identifiers = EntityIdentifier()
        for ident in node.findall("eu:identification", _NS):
            self._add_identifier(
                identifiers, ident.get("identificationTypeCode", ""), ident.get("number", "")
            )
        return identifiers

    @staticmethod
    def _add_identifier(identifiers: EntityIdentifier, type_code: str, number: str) -> None:
        """Route one identifier number into the matching canonical bucket."""
        if not number:
            return
        bucket = {"passport": identifiers.passport, "national_id": identifiers.national_id}.get(
            type_code.lower()
        )
        if bucket is not None:
            bucket.append(number)
        else:
            identifiers.other.setdefault(type_code or "other", []).append(number)
