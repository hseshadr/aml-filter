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
                name_canonical=normalized["name_canonical"],
                name_tokens=normalized["name_tokens"],
                name_trigram=normalized["name_trigram"],
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
        aliases: list[Alias] = []

        # Parse aka (also known as) entries
        for aka in sdn_entry.findall(".//ofac:aka", self.namespace):
            first_name_elem = aka.find("ofac:firstName", self.namespace)
            last_name_elem = aka.find("ofac:lastName", self.namespace)
            title_elem = aka.find("ofac:title", self.namespace)

            first_name = (
                first_name_elem.text.strip()
                if first_name_elem is not None and first_name_elem.text
                else ""
            )
            last_name = (
                last_name_elem.text.strip()
                if last_name_elem is not None and last_name_elem.text
                else ""
            )
            title = title_elem.text.strip() if title_elem is not None and title_elem.text else ""

            name_parts = [p for p in [title, first_name, last_name] if p]
            if name_parts:
                alias_name = " ".join(name_parts)
                normalized = normalize_name(alias_name)
                aliases.append(
                    Alias(
                        name=alias_name,
                        name_canonical=normalized["name_canonical"],
                        source="OFAC",
                    )
                )

        return aliases

    def _parse_dates_of_birth(self, sdn_entry: ET.Element) -> list[date]:
        """Parse dates of birth from SDN entry."""
        dob_list: list[date] = []

        for date_of_birth in sdn_entry.findall(".//ofac:dateOfBirth", self.namespace):
            date_str = date_of_birth.text.strip() if date_of_birth.text else ""
            if date_str:
                try:
                    # OFAC dates are typically in YYYY-MM-DD format
                    parsed_date = datetime.strptime(date_str, "%Y-%m-%d").date()
                    dob_list.append(parsed_date)
                except ValueError:
                    # Try other formats or skip
                    try:
                        parsed_date = datetime.strptime(date_str, "%Y").date()
                        dob_list.append(parsed_date)
                    except ValueError:
                        pass

        return dob_list

    def _parse_locations(self, sdn_entry: ET.Element) -> tuple[list[str], list[str], list[str]]:
        """Parse countries, nationalities, and addresses from SDN entry."""
        countries: list[str] = []
        nationalities: list[str] = []
        addresses: list[str] = []

        # Parse places of birth
        for place_of_birth in sdn_entry.findall(".//ofac:placeOfBirth", self.namespace):
            country = place_of_birth.text.strip() if place_of_birth.text else ""
            if country and len(country) == ISO_COUNTRY_CODE_LENGTH:
                countries.append(country.upper())

        # Parse citizenships
        for citizenship in sdn_entry.findall(".//ofac:citizenship", self.namespace):
            country = citizenship.text.strip() if citizenship.text else ""
            if country and len(country) == ISO_COUNTRY_CODE_LENGTH:
                nationalities.append(country.upper())

        # Parse addresses
        for address_elem in sdn_entry.findall(".//ofac:address", self.namespace):
            parts = []
            for sub_elem in [
                "ofac:address1",
                "ofac:address2",
                "ofac:address3",
                "ofac:city",
                "ofac:stateOrProvince",
                "ofac:postalCode",
                "ofac:country",
            ]:
                val = address_elem.find(sub_elem, self.namespace)
                if val is not None and val.text:
                    parts.append(val.text.strip())

            if parts:
                addresses.append(", ".join(parts))

        return countries, nationalities, addresses

    def _parse_identifiers(self, sdn_entry: ET.Element) -> EntityIdentifier:
        """Parse identifiers (passports, etc.) from SDN entry."""
        identifiers = EntityIdentifier()

        # Parse passports
        for passport in sdn_entry.findall(".//ofac:passport", self.namespace):
            passport_num = passport.text.strip() if passport.text else ""
            if passport_num:
                identifiers.passport.append(passport_num)

        # Parse national IDs
        for national_id in sdn_entry.findall(".//ofac:nationalId", self.namespace):
            id_num = national_id.text.strip() if national_id.text else ""
            if id_num:
                identifiers.national_id.append(id_num)

        return identifiers
