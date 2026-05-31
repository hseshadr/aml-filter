"""OFAC SDN XML parser."""

import logging
import xml.etree.ElementTree as ET  # type-only; parsing uses defusedxml below
from datetime import date, datetime
from typing import Final, Literal

from defusedxml.ElementTree import fromstring as defused_fromstring

from aml_filter.domain.entity import Alias, Entity, EntityIdentifier
from aml_filter.domain.normalization import normalize_name

logger = logging.getLogger(__name__)

ISO_COUNTRY_CODE_LENGTH: Final[int] = 2


class OFACParser:
    """Parser for OFAC SDN (Specially Designated Nationals) XML files."""

    def __init__(self) -> None:
        """Initialize OFAC parser."""
        self.namespace = {"ofac": "http://tempuri.org/sdnList.xsd"}

    def parse(self, xml_content: str | bytes) -> list[Entity]:
        """
        Parse OFAC SDN XML content.

        Args:
            xml_content: XML content as string or bytes

        Returns:
            List of Entity objects
        """
        if isinstance(xml_content, bytes):
            xml_content = xml_content.decode("utf-8")

        root = defused_fromstring(xml_content)  # defusedxml — XXE / billion-laughs protection

        entities: list[Entity] = []

        # Find all sdnEntry elements
        for sdn_entry in root.findall(".//ofac:sdnEntry", self.namespace):
            entity = self._parse_sdn_entry(sdn_entry)
            if entity:
                entities.append(entity)

        return entities

    def _parse_sdn_entry(self, sdn_entry: ET.Element) -> Entity | None:
        """Parse a single SDN entry into an Entity. Returns None for malformed/missing-uid rows."""
        try:
            uid = self._read_element_text(sdn_entry, "ofac:uid")
            if not uid:
                return None
            primary_name = self._build_sdn_primary_name(sdn_entry)
            normalized = normalize_name(primary_name)
            countries, nationalities, addresses = self._parse_locations(sdn_entry)
            return Entity(
                entity_id=f"ofac:sdn:{uid}",
                tenant_id=None,
                entity_type=self._read_sdn_entity_type(sdn_entry),
                primary_name=primary_name,
                name_canonical=normalized.name_canonical,
                name_tokens=normalized.name_tokens,
                name_trigram=normalized.name_trigram,
                aliases=self._parse_aliases(sdn_entry),
                dob=self._parse_dates_of_birth(sdn_entry),
                countries=countries,
                nationalities=nationalities,
                addresses=addresses,
                identifiers=self._parse_identifiers(sdn_entry),
                risk_category="SANCTION",
                source_list="OFAC_SDN",
                list_version=datetime.now().strftime("%Y-%m-%d"),
                custom_list_id=None,
                raw_source={"uid": uid, "xml_entry": ET.tostring(sdn_entry, encoding="unicode")},
            )
        except (ET.ParseError, AttributeError, ValueError, KeyError) as exc:
            logger.warning("Skipping malformed SDN entry: %s", exc)
            return None

    def _read_element_text(self, parent: ET.Element, tag: str) -> str:
        """Return the stripped text of `parent/tag`, or empty string if missing."""
        elem = parent.find(tag, self.namespace)
        return elem.text.strip() if elem is not None and elem.text else ""

    def _build_sdn_primary_name(self, sdn_entry: ET.Element) -> str:
        """Join title + first + last into the primary name; 'UNKNOWN' if all empty."""
        parts = [
            self._read_element_text(sdn_entry, "ofac:title"),
            self._read_element_text(sdn_entry, "ofac:firstName"),
            self._read_element_text(sdn_entry, "ofac:lastName"),
        ]
        non_empty = [p for p in parts if p]
        return " ".join(non_empty) if non_empty else "UNKNOWN"

    def _read_sdn_entity_type(self, sdn_entry: ET.Element) -> Literal["PERSON", "ORGANIZATION"]:
        """Read ofac:sdnType; ORGANIZATION if it contains ORGANIZATION/ENTITY, else PERSON."""
        text = self._read_element_text(sdn_entry, "ofac:sdnType").upper()
        if "ORGANIZATION" in text or "ENTITY" in text:
            return "ORGANIZATION"
        return "PERSON"

    def _parse_aliases(self, sdn_entry: ET.Element) -> list[Alias]:
        """Parse aliases from SDN entry."""
        aliases = [
            self._build_alias(aka) for aka in sdn_entry.findall(".//ofac:aka", self.namespace)
        ]
        return [alias for alias in aliases if alias is not None]

    def _build_alias(self, aka: ET.Element) -> Alias | None:
        """Build an Alias from an aka element, or None when no name parts exist."""
        name_parts = [
            self._read_element_text(aka, tag)
            for tag in ("ofac:title", "ofac:firstName", "ofac:lastName")
        ]
        non_empty = [part for part in name_parts if part]
        if not non_empty:
            return None
        alias_name = " ".join(non_empty)
        normalized = normalize_name(alias_name)
        return Alias(name=alias_name, name_canonical=normalized.name_canonical, source="OFAC")

    def _parse_dates_of_birth(self, sdn_entry: ET.Element) -> list[date]:
        """Parse dates of birth from SDN entry."""
        elements = sdn_entry.findall(".//ofac:dateOfBirth", self.namespace)
        parsed = (self._parse_dob_text(elem.text.strip() if elem.text else "") for elem in elements)
        return [dob for dob in parsed if dob is not None]

    @staticmethod
    def _parse_dob_text(date_str: str) -> date | None:
        """Parse an OFAC DOB string (YYYY-MM-DD, then YYYY), or None if unparseable."""
        for fmt in ("%Y-%m-%d", "%Y"):
            try:
                return datetime.strptime(date_str, fmt).date()
            except ValueError:
                continue
        return None

    _ADDRESS_SUBTAGS: Final = (
        "ofac:address1",
        "ofac:address2",
        "ofac:address3",
        "ofac:city",
        "ofac:stateOrProvince",
        "ofac:postalCode",
        "ofac:country",
    )

    def _parse_locations(self, sdn_entry: ET.Element) -> tuple[list[str], list[str], list[str]]:
        """Parse countries, nationalities, and addresses from SDN entry."""
        countries = self._parse_country_codes(sdn_entry, ".//ofac:placeOfBirth")
        nationalities = self._parse_country_codes(sdn_entry, ".//ofac:citizenship")
        addresses = [
            joined
            for address_elem in sdn_entry.findall(".//ofac:address", self.namespace)
            if (joined := self._join_address(address_elem))
        ]
        return countries, nationalities, addresses

    def _parse_country_codes(self, sdn_entry: ET.Element, path: str) -> list[str]:
        """Collect upper-cased ISO-2 country codes under `path`."""
        codes = (
            self._read_element_text(elem, ".") for elem in sdn_entry.findall(path, self.namespace)
        )
        return [code.upper() for code in codes if len(code) == ISO_COUNTRY_CODE_LENGTH]

    def _join_address(self, address_elem: ET.Element) -> str:
        """Join populated address sub-fields into a single comma-separated line."""
        parts = [self._read_element_text(address_elem, tag) for tag in self._ADDRESS_SUBTAGS]
        return ", ".join(part for part in parts if part)

    def _parse_identifiers(self, sdn_entry: ET.Element) -> EntityIdentifier:
        """Parse identifiers (passports, etc.) from SDN entry."""
        return EntityIdentifier(
            passport=self._collect_texts(sdn_entry, ".//ofac:passport"),
            national_id=self._collect_texts(sdn_entry, ".//ofac:nationalId"),
        )

    def _collect_texts(self, sdn_entry: ET.Element, path: str) -> list[str]:
        """Collect non-empty stripped texts of all elements under `path`."""
        texts = (
            self._read_element_text(elem, ".") for elem in sdn_entry.findall(path, self.namespace)
        )
        return [text for text in texts if text]
