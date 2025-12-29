"""OFAC SDN XML parser."""

import xml.etree.ElementTree as ET
from datetime import date, datetime
from typing import Any, Literal

from aml_filter.domain.entity import Alias, Entity, EntityIdentifier
from aml_filter.domain.normalization import normalize_name


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

        root = ET.fromstring(xml_content)

        entities: list[Entity] = []

        # Find all sdnEntry elements
        for sdn_entry in root.findall(".//ofac:sdnEntry", self.namespace):
            entity = self._parse_sdn_entry(sdn_entry)
            if entity:
                entities.append(entity)

        return entities

    def _parse_sdn_entry(self, sdn_entry: ET.Element) -> Entity | None:
        """Parse a single SDN entry."""
        try:
            # Get uid (unique identifier)
            uid_elem = sdn_entry.find("ofac:uid", self.namespace)
            if uid_elem is None or uid_elem.text is None:
                return None

            uid = uid_elem.text.strip()
            entity_id = f"ofac:sdn:{uid}"

            # Get primary name
            first_name_elem = sdn_entry.find("ofac:firstName", self.namespace)
            last_name_elem = sdn_entry.find("ofac:lastName", self.namespace)
            title_elem = sdn_entry.find("ofac:title", self.namespace)

            first_name = first_name_elem.text.strip() if first_name_elem is not None and first_name_elem.text else ""
            last_name = last_name_elem.text.strip() if last_name_elem is not None and last_name_elem.text else ""
            title = title_elem.text.strip() if title_elem is not None and title_elem.text else ""

            # Build primary name
            name_parts = [p for p in [title, first_name, last_name] if p]
            primary_name = " ".join(name_parts) if name_parts else "UNKNOWN"

            # Normalize name
            normalized = normalize_name(primary_name)

            # Determine entity type
            entity_type: Literal["PERSON", "ORGANIZATION"] = "PERSON"  # Default for SDN
            type_elem = sdn_entry.find("ofac:sdnType", self.namespace)
            if type_elem is not None and type_elem.text:
                entity_type_text = type_elem.text.upper()
                if "ORGANIZATION" in entity_type_text or "ENTITY" in entity_type_text:
                    entity_type = "ORGANIZATION"

            # Parse aliases
            aliases = self._parse_aliases(sdn_entry)

            # Parse DOB
            dob_list = self._parse_dates_of_birth(sdn_entry)

            # Parse locations
            countries, nationalities, addresses = self._parse_locations(sdn_entry)

            # Parse identifiers
            identifiers = self._parse_identifiers(sdn_entry)

            # Get program list (source list)
            program_list = self._parse_program_list(sdn_entry)

            # Get list version (from publication date if available)
            list_version = datetime.now().strftime("%Y-%m-%d")  # Default to today

            # Build raw source
            raw_source = {
                "uid": uid,
                "xml_entry": ET.tostring(sdn_entry, encoding="unicode"),
            }

            entity = Entity(
                entity_id=entity_id,
                tenant_id=None,  # Global entity
                entity_type=entity_type,
                primary_name=primary_name,
                name_canonical=normalized["name_canonical"],
                name_tokens=normalized["name_tokens"],
                name_trigram=normalized["name_trigram"],
                aliases=aliases,
                dob=dob_list,
                countries=countries,
                nationalities=nationalities,
                addresses=addresses,
                identifiers=identifiers,
                risk_category="SANCTION",
                source_list="OFAC_SDN",
                list_version=list_version,
                custom_list_id=None,
                raw_source=raw_source,
            )

            return entity

        except Exception as e:
            # Log error and skip this entry
            print(f"Error parsing SDN entry: {e}")
            return None

    def _parse_aliases(self, sdn_entry: ET.Element) -> list[Alias]:
        """Parse aliases from SDN entry."""
        aliases: list[Alias] = []

        # Parse aka (also known as) entries
        for aka in sdn_entry.findall(".//ofac:aka", self.namespace):
            first_name_elem = aka.find("ofac:firstName", self.namespace)
            last_name_elem = aka.find("ofac:lastName", self.namespace)
            title_elem = aka.find("ofac:title", self.namespace)

            first_name = first_name_elem.text.strip() if first_name_elem is not None and first_name_elem.text else ""
            last_name = last_name_elem.text.strip() if last_name_elem is not None and last_name_elem.text else ""
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
            if country and len(country) == 2:  # ISO code
                countries.append(country.upper())

        # Parse citizenships
        for citizenship in sdn_entry.findall(".//ofac:citizenship", self.namespace):
            country = citizenship.text.strip() if citizenship.text else ""
            if country and len(country) == 2:  # ISO code
                nationalities.append(country.upper())

        # Parse addresses
        for address_elem in sdn_entry.findall(".//ofac:address", self.namespace):
            parts = []
            for sub_elem in ["ofac:address1", "ofac:address2", "ofac:address3", "ofac:city", "ofac:stateOrProvince", "ofac:postalCode", "ofac:country"]:
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

    def _parse_program_list(self, sdn_entry: ET.Element) -> str:
        """Parse program list from SDN entry."""
        # OFAC SDN entries have programList elements
        program_list = "OFAC_SDN"  # Default

        program_list_elem = sdn_entry.find("ofac:programList", self.namespace)
        if program_list_elem is not None:
            # Could parse specific programs, but for now use default
            pass

        return program_list

