"""Batch file parser for CSV and JSON."""

import csv
import json
import logging
from datetime import date
from io import StringIO
from typing import Literal

from pydantic import ValidationError

from aml_filter.domain.search import SearchQuery
from aml_filter.types import JsonArray, JsonObject, JsonValue

logger = logging.getLogger(__name__)


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


def _detect_format(filename: str | None, format: str | None) -> str | None:
    """Resolve an explicit format, else infer from the filename extension."""
    if format is not None:
        return format
    suffix_formats = {".csv": "csv", ".json": "json"}
    for suffix, name in suffix_formats.items():
        if filename and filename.endswith(suffix):
            return name
    return None


def _apply_csv_mapping(row: dict[str, str], field_mapping: dict[str, str] | None) -> dict[str, str]:
    """Rename source columns to SearchQuery fields, or pass the row through unmapped."""
    if not field_mapping:
        return row
    return {dest: row[src] for src, dest in field_mapping.items() if src in row}


def _load_json_items(content: str) -> JsonArray:
    """Decode JSON into a list of items; wrap a single object, [] on decode error."""
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else [data]


def _apply_json_mapping(item: JsonObject, field_mapping: dict[str, str] | None) -> JsonObject:
    """Rename source keys to SearchQuery fields, or pass the item through unmapped."""
    if not field_mapping:
        return item
    return {dest: item[src] for src, dest in field_mapping.items() if src in item}


def _csv_row_to_query(mapped_row: dict[str, str]) -> SearchQuery | None:
    """Build a SearchQuery from a mapped CSV row, or None when name is empty/invalid."""
    try:
        query = SearchQuery(
            name=mapped_row.get("name", "").strip(),
            dob=_parse_dob(mapped_row.get("dob")),
            country=mapped_row.get("country", "").strip() or None,
            entity_type=_parse_entity_type(mapped_row.get("entity_type")),
            threshold=float(mapped_row.get("threshold", "0.65")),
            k=int(mapped_row.get("k", "20")),
        )
    except (ValueError, KeyError):
        return None
    return query if query.name else None


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
        resolved = _detect_format(filename, format)
        if resolved == "csv":
            return BatchParser.parse_csv(content, field_mapping)
        if resolved == "json":
            return BatchParser.parse_json(content, field_mapping)
        raise ValueError(f"Unsupported format or file extension: {resolved or filename}")

    @staticmethod
    def parse_csv(content: str, field_mapping: dict[str, str] | None = None) -> list[SearchQuery]:
        """Parse CSV content into SearchQuery objects."""
        reader = csv.DictReader(StringIO(content))
        candidates = (_csv_row_to_query(_apply_csv_mapping(row, field_mapping)) for row in reader)
        return [query for query in candidates if query is not None]

    @staticmethod
    def parse_json(content: str, field_mapping: dict[str, str] | None = None) -> list[SearchQuery]:
        """Parse JSON content into SearchQuery objects."""
        items = _load_json_items(content)
        candidates = (BatchParser._json_item_to_query(item, field_mapping) for item in items)
        return [query for query in candidates if query is not None]

    @staticmethod
    def _json_item_to_query(
        item: JsonValue, field_mapping: dict[str, str] | None
    ) -> SearchQuery | None:
        """Build a SearchQuery from one JSON item, logging and skipping invalid rows."""
        if not isinstance(item, dict):
            logger.warning("Skipping non-object batch row: %r", item)
            return None
        try:
            return SearchQuery.model_validate(_apply_json_mapping(item, field_mapping))
        except (ValidationError, TypeError, KeyError) as exc:
            logger.warning("Skipping invalid batch row: %s", exc)
            return None
