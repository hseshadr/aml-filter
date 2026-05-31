"""Typed payloads stored in a BatchJob's JSONB ``metadata_json`` column."""

from pydantic import BaseModel, TypeAdapter

from aml_filter.domain.search import SearchQuery, SearchResponse
from aml_filter.types import JsonArray, JsonObject, JsonValue


class BatchMatchRow(BaseModel):
    """A single match row serialised into a batch result."""

    entity_id: str
    score: float
    risk_category: str
    source_list: str
    primary_name: str


class BatchResultRow(BaseModel):
    """One query's result within a completed batch job."""

    request_id: str
    matches: list[BatchMatchRow]


_QUERIES = TypeAdapter(list[SearchQuery])
_RESULTS = TypeAdapter(list[BatchResultRow])


def load_queries(metadata: JsonObject) -> list[SearchQuery]:
    """Validate the stored ``queries`` payload into typed SearchQuery objects."""
    return _QUERIES.validate_python(metadata.get("queries", []))


def load_results(value: JsonValue) -> list[BatchResultRow]:
    """Validate a stored ``results`` payload into typed BatchResultRow objects."""
    return _RESULTS.validate_python(value or [])


def _row_from_response(response: SearchResponse) -> BatchResultRow:
    """Project one SearchResponse into the stored batch result row."""
    return BatchResultRow(
        request_id=response.request_id,
        matches=[
            BatchMatchRow(
                entity_id=m.entity_id,
                score=m.score,
                risk_category=m.risk_category,
                source_list=m.source_list,
                primary_name=m.primary_name,
            )
            for m in response.matches
        ],
    )


def dump_results(responses: list[SearchResponse]) -> JsonArray:
    """Serialise search responses into the JSONB-storable ``results`` payload."""
    return [row.model_dump() for row in (_row_from_response(r) for r in responses)]
