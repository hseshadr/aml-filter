"""Domain metadata bundled as ``ofac_meta.json`` (typed JSON).

The bundle's version pointer: ``list_id`` + ``version`` mirror the OFAC
``ListVersion`` (the ACTIVE, version-stamped list), so the consumer can report
``list_versions_used`` without touching Postgres.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class OfacBundleMeta(BaseModel):
    """Typed metadata for one published OFAC bundle (``ofac_meta.json``)."""

    list_id: str = Field(..., min_length=1, max_length=100)
    version: str = Field(..., min_length=1, max_length=50)
    entity_count: int = Field(..., ge=0)
    embedding_model: str = Field(..., min_length=1)
    embedding_dim: int = Field(..., ge=1)
