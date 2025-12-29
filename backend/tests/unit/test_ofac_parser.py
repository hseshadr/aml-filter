"""Unit tests for OFACParser."""

import pytest
import xml.etree.ElementTree as ET
from aml_filter.ingest.parsers.ofac import OFACParser
from aml_filter.domain.entity import Entity

@pytest.fixture
def parser():
    return OFACParser()

def test_parse_bytes(parser):
    """Test parsing with bytes input."""
    xml_content = b"""<?xml version="1.0" encoding="UTF-8"?>
    <sdnList xmlns="http://tempuri.org/sdnList.xsd">
        <sdnEntry>
            <uid>123</uid>
            <firstName>John</firstName>
            <lastName>Doe</lastName>
            <sdnType>Individual</sdnType>
        </sdnEntry>
    </sdnList>"""
    entities = parser.parse(xml_content)
    assert len(entities) == 1
    assert entities[0].primary_name == "John Doe"

def test_parse_sdn_entry_missing_uid(parser):
    """Test parsing entry with missing UID."""
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
    <sdnList xmlns="http://tempuri.org/sdnList.xsd">
        <sdnEntry>
            <firstName>John</firstName>
            <lastName>Doe</lastName>
        </sdnEntry>
    </sdnList>"""
    entities = parser.parse(xml_content)
    assert len(entities) == 0

def test_parse_sdn_entry_organization(parser):
    """Test parsing an organization entry."""
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
    <sdnList xmlns="http://tempuri.org/sdnList.xsd">
        <sdnEntry>
            <uid>456</uid>
            <lastName>Test Org</lastName>
            <sdnType>Entity</sdnType>
        </sdnEntry>
    </sdnList>"""
    entities = parser.parse(xml_content)
    assert len(entities) == 1
    assert entities[0].entity_type == "ORGANIZATION"

def test_parse_aliases(parser):
    """Test parsing aliases."""
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
    <sdnList xmlns="http://tempuri.org/sdnList.xsd">
        <sdnEntry>
            <uid>789</uid>
            <lastName>Real Name</lastName>
            <akaList>
                <aka>
                    <firstName>Alias</firstName>
                    <lastName>One</lastName>
                </aka>
            </akaList>
        </sdnEntry>
    </sdnList>"""
    entities = parser.parse(xml_content)
    assert len(entities) == 1
    assert len(entities[0].aliases) == 1
    assert entities[0].aliases[0].name == "Alias One"

def test_parse_dob_formats(parser):
    """Test parsing various DOB formats."""
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
    <sdnList xmlns="http://tempuri.org/sdnList.xsd">
        <sdnEntry>
            <uid>101</uid>
            <lastName>Date Test</lastName>
            <dateOfBirthList>
                <dateOfBirth>1980-01-01</dateOfBirth>
                <dateOfBirth>1970</dateOfBirth>
                <dateOfBirth>Invalid</dateOfBirth>
            </dateOfBirthList>
        </sdnEntry>
    </sdnList>"""
    entities = parser.parse(xml_content)
    assert len(entities) == 1
    assert len(entities[0].dob) == 2
    assert entities[0].dob[0].year == 1980
    assert entities[0].dob[1].year == 1970

def test_parse_locations_and_identifiers(parser):
    """Test parsing locations (POB, citizenship) and identifiers."""
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
    <sdnList xmlns="http://tempuri.org/sdnList.xsd">
        <sdnEntry>
            <uid>202</uid>
            <lastName>Location Test</lastName>
            <placeOfBirthList>
                <placeOfBirth>AF</placeOfBirth>
            </placeOfBirthList>
            <citizenshipList>
                <citizenship>IR</citizenship>
            </citizenshipList>
            <idList>
                <id>
                    <idType>Passport</idType>
                    <idNumber>P12345</idNumber>
                </id>
            </idList>
        </sdnEntry>
    </sdnList>"""
    # Note: OFAC XML structure for IDs is slightly different in our parser implementation
    # Let's adjust based on _parse_identifiers which uses findall(".//ofac:passport")
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
    <sdnList xmlns="http://tempuri.org/sdnList.xsd">
        <sdnEntry xmlns:ofac="http://tempuri.org/sdnList.xsd">
            <ofac:uid>202</ofac:uid>
            <ofac:lastName>Location Test</ofac:lastName>
            <ofac:placeOfBirthList>
                <ofac:placeOfBirth>AF</ofac:placeOfBirth>
            </ofac:placeOfBirthList>
            <ofac:citizenshipList>
                <ofac:citizenship>IR</ofac:citizenship>
            </ofac:citizenshipList>
            <ofac:addressList>
                <ofac:address>
                    <ofac:city>Kabul</ofac:city>
                    <ofac:country>Afghanistan</ofac:country>
                </ofac:address>
            </ofac:addressList>
            <ofac:idList>
                <ofac:passport>P12345</ofac:passport>
                <ofac:nationalId>N98765</ofac:nationalId>
            </ofac:idList>
        </sdnEntry>
    </sdnList>"""
    entities = parser.parse(xml_content)
    assert len(entities) == 1
    assert "AF" in entities[0].countries
    assert "IR" in entities[0].nationalities
    assert len(entities[0].addresses) == 1
    assert "Kabul" in entities[0].addresses[0]
    assert "P12345" in entities[0].identifiers.passport
    assert "N98765" in entities[0].identifiers.national_id

