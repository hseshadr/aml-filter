import json
from datetime import date

import pytest

from aml_filter.batch.parser import BatchParser


def test_parse_csv_basic():
    """Test parsing a simple CSV file."""
    csv_content = "name,dob,country\nJohn Doe,1980-01-01,US\nJane Smith,,UK"

    parser = BatchParser()
    records = parser.parse(csv_content, format="csv")

    assert len(records) == 2
    assert records[0].name == "John Doe"
    assert records[0].dob == date(1980, 1, 1)
    assert records[1].name == "Jane Smith"
    assert records[1].country == "UK"


def test_parse_json_basic():
    """Test parsing a simple JSON file."""
    data = [
        {"name": "John Doe", "dob": "1980-01-01", "country": "US"},
        {"name": "Jane Smith", "country": "UK"},
    ]
    json_content = json.dumps(data)

    parser = BatchParser()
    records = parser.parse(json_content, format="json")

    assert len(records) == 2
    assert records[0].name == "John Doe"
    assert records[1].name == "Jane Smith"


def test_parse_with_field_mapping():
    """Test parsing with custom field mapping."""
    csv_content = "Full Name,Date of Birth,Region\nJohn Doe,1980-01-01,US"

    field_mapping = {"Full Name": "name", "Date of Birth": "dob", "Region": "country"}

    parser = BatchParser()
    records = parser.parse(csv_content, format="csv", field_mapping=field_mapping)

    assert len(records) == 1
    assert records[0].name == "John Doe"
    assert records[0].dob == date(1980, 1, 1)
    assert records[0].country == "US"


def test_parse_invalid_extension():
    """Test parsing with unsupported file extension."""
    parser = BatchParser()

    with pytest.raises(ValueError, match="Unsupported format or file extension"):
        parser.parse("some content", filename="test.txt")
