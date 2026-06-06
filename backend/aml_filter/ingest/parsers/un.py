"""UN Security Council consolidated sanctions list parser.

Models the UN consolidated list XML (``consolidated.xml``), which has **no XML
namespace**. ``<INDIVIDUAL>`` and ``<ENTITY>`` nodes share name fields
(``FIRST_NAME`` .. ``FOURTH_NAME``, joined in order to form the primary name) and
carry list-specific children: individuals have ``INDIVIDUAL_ALIAS``,
``INDIVIDUAL_DATE_OF_BIRTH``, ``INDIVIDUAL_DOCUMENT`` and ``NATIONALITY``;
entities have ``ENTITY_ALIAS`` and ``ENTITY_ADDRESS``.

Assumption: ``INDIVIDUAL_DOCUMENT``/``TYPE_OF_DOCUMENT`` containing ``passport`` maps
to the passport bucket and ``national`` to the national-id bucket; any other type goes
to ``other`` keyed by its document-type text.
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

_LIST_ID = "UN_CONSOLIDATED"
_NAME_TAGS = ("FIRST_NAME", "SECOND_NAME", "THIRD_NAME", "FOURTH_NAME")


@parser_for(_LIST_ID)
class UNConsolidatedParser:
    """Parser for the UN Security Council consolidated sanctions XML."""

    list_id = _LIST_ID

    def parse(self, raw: str | bytes) -> list[Entity]:
        """Parse the UN consolidated XML into canonical entities."""
        root = defused_fromstring(decode_raw(raw))  # defusedxml — XXE / billion-laughs protection
        version = root.get("dateGenerated", "") or "unknown"
        persons = self._parse_group(root, ".//INDIVIDUAL", "PERSON", "INDIVIDUAL_ALIAS", version)
        orgs = self._parse_group(root, ".//ENTITY", "ORGANIZATION", "ENTITY_ALIAS", version)
        return persons + orgs

    def _parse_group(
        self,
        root: ET.Element,
        path: str,
        entity_type: Literal["PERSON", "ORGANIZATION"],
        alias_tag: str,
        version: str,
    ) -> list[Entity]:
        """Parse all nodes under ``path`` as one entity type."""
        parsed = (
            self._parse_node(node, entity_type, alias_tag, version) for node in root.findall(path)
        )
        return [entity for entity in parsed if entity is not None]

    def _parse_node(
        self,
        node: ET.Element,
        entity_type: Literal["PERSON", "ORGANIZATION"],
        alias_tag: str,
        version: str,
    ) -> Entity | None:
        """Convert one INDIVIDUAL/ENTITY node into a canonical entity."""
        data_id = self._text(node, "DATAID")
        primary = self._full_name(node)
        if not data_id or not primary:
            return None
        return build_entity(
            EntityFields(
                entity_id=f"un:{data_id}",
                entity_type=entity_type,
                primary_name=primary,
                source_list=_LIST_ID,
                version=version,
                aliases=self._aliases(node, alias_tag),
                dob=self._dobs(node),
                nationalities=self._nationalities(node),
                addresses=self._addresses(node),
                identifiers=self._identifiers(node),
                raw_source={"DATAID": data_id},
            )
        )

    def _full_name(self, node: ET.Element) -> str:
        """Join FIRST..FOURTH name parts in order."""
        return " ".join(part for part in (self._text(node, tag) for tag in _NAME_TAGS) if part)

    def _aliases(self, node: ET.Element, alias_tag: str) -> list[Alias]:
        """Collect alias names under the list-specific alias tag."""
        built = (build_alias(self._text(a, "ALIAS_NAME"), "UN") for a in node.findall(alias_tag))
        return [alias for alias in built if alias is not None]

    def _dobs(self, node: ET.Element) -> list[date]:
        """Parse all individual dates of birth."""
        raw = (
            self._text(d, "DATE") or self._text(d, "YEAR")
            for d in node.findall("INDIVIDUAL_DATE_OF_BIRTH")
        )
        return parse_dates(raw)

    def _nationalities(self, node: ET.Element) -> list[str]:
        """Collect nationality VALUE entries (UN publishes country names)."""
        return non_empty(v.text or "" for v in node.findall("NATIONALITY/VALUE"))

    def _addresses(self, node: ET.Element) -> list[str]:
        """Join populated entity-address sub-fields into comma-separated lines."""
        tags = ("STREET", "CITY", "COUNTRY")
        lines = (
            join_fields(self._text(a, t) for t in tags) for a in node.findall("ENTITY_ADDRESS")
        )
        return [line for line in lines if line]

    def _identifiers(self, node: ET.Element) -> EntityIdentifier:
        """Bucket documents by their TYPE_OF_DOCUMENT."""
        identifiers = EntityIdentifier()
        for doc in node.findall("INDIVIDUAL_DOCUMENT"):
            self._add_document(
                identifiers, self._text(doc, "TYPE_OF_DOCUMENT"), self._text(doc, "NUMBER")
            )
        return identifiers

    @staticmethod
    def _add_document(identifiers: EntityIdentifier, doc_type: str, number: str) -> None:
        """Route one document number into the matching canonical bucket."""
        if not number:
            return
        lowered = doc_type.lower()
        if "passport" in lowered:
            identifiers.passport.append(number)
        elif "national" in lowered:
            identifiers.national_id.append(number)
        else:
            identifiers.other.setdefault(doc_type or "other", []).append(number)

    @staticmethod
    def _text(parent: ET.Element, tag: str) -> str:
        """Return stripped text of ``parent/tag`` or empty string."""
        elem = parent.find(tag)
        return elem.text.strip() if elem is not None and elem.text else ""
