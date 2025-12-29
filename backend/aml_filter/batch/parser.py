"""Batch file parser for CSV and JSON."""

import csv
import json
from datetime import date
from io import StringIO
from typing import Any, Literal

from aml_filter.domain.search import SearchQuery


def _parse_dob(value: str | None) -> date | None:
    """Parse DOB string to date object."""
    if not value or not value.strip():
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


def _parse_entity_type(value: str | None) -> Literal["PERSON", "ORGANIZATION"] | None:
    """Parse entity type string to Literal type."""
    if not value:
        return None
    upper_val = value.strip().upper()
    if upper_val in ("PERSON", "ORGANIZATION"):
        return upper_val  # type: ignore[return-value]
    return None


class BatchParser:
    """Parser for batch screening files."""

    @staticmethod
    def parse(
        content: str | bytes,
        filename: str | None = None,
        format: str | None = None,
        field_mapping: dict[str, str] | None = None,
    ) -> list[SearchQuery]:
        """
        Parse content based on format or filename.

        Args:
            content: Content to parse
            filename: Optional filename to detect format from extension
            format: Optional format ("csv" or "json")
            field_mapping: Optional mapping from file columns to SearchQuery fields

        Returns:
            List of SearchQuery objects
        """
        if isinstance(content, bytes):
            content = content.decode("utf-8")

        if format is None and filename:
            if filename.endswith(".csv"):
                format = "csv"
            elif filename.endswith(".json"):
                format = "json"

        if format == "csv":
            return BatchParser.parse_csv(content, field_mapping)
        elif format == "json":
            return BatchParser.parse_json(content, field_mapping)
        else:
            raise ValueError(f"Unsupported format or file extension: {format or filename}")

    @staticmethod
    def parse_csv(content: str, field_mapping: dict[str, str] | None = None) -> list[SearchQuery]:
        """Parse CSV content into SearchQuery objects."""
        reader = csv.DictReader(StringIO(content))
        queries = []

        for row in reader:
            try:
                # Apply mapping if provided
                mapped_row = {}
                if field_mapping:
                    for src, dest in field_mapping.items():
                        if src in row:
                            mapped_row[dest] = row[src]
                else:
                    mapped_row = row

                query = SearchQuery(
                    name=mapped_row.get("name", "").strip(),
                    dob=_parse_dob(mapped_row.get("dob")),
                    country=mapped_row.get("country", "").strip() or None,
                    entity_type=_parse_entity_type(mapped_row.get("entity_type")),
                    threshold=float(mapped_row.get("threshold", "0.65")),
                    k=int(mapped_row.get("k", "20")),
                )
                if query.name:
                    queries.append(query)
            except (ValueError, KeyError):
                continue

        return queries

    @staticmethod
    def parse_json(content: str, field_mapping: dict[str, str] | None = None) -> list[SearchQuery]:
        """Parse JSON content into SearchQuery objects."""
        try:
            data = json.loads(content)
            if not isinstance(data, list):
                data = [data]

            queries = []
            for item in data:
                try:
                    # Apply mapping if provided
                    mapped_item = {}
                    if field_mapping:
                        for src, dest in field_mapping.items():
                            if src in item:
                                mapped_item[dest] = item[src]
                    else:
                        mapped_item = item

                    query = SearchQuery(**mapped_item)
                    queries.append(query)
                except Exception:
                    continue
            return queries
        except json.JSONDecodeError:
            return []

