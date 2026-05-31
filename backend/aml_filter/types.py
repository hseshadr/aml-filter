"""Shared JSON typing aliases.

These replace ``dict[str, Any]`` at boundaries that carry opaque-but-valid JSON
(JSONB columns, raw source records, audit payloads). ``JsonValue`` is Pydantic's
recursive JSON type, so it is strictly typed (no ``Any``) yet accepts any value a
JSON document can hold.
"""

from pydantic import JsonValue

# A JSON object payload (e.g. a JSONB column holding an object).
JsonObject = dict[str, JsonValue]

# A JSON array payload (e.g. a JSONB column holding a list of objects).
JsonArray = list[JsonValue]

__all__ = ["JsonArray", "JsonObject", "JsonValue"]
