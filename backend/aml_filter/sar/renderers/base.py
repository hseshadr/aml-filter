"""The SAR renderer contract.

A renderer turns a typed ``SarRecord`` into a fileable artifact in two formats:
a structured JSON export and a PDF laid out for the jurisdiction's form. New
jurisdictions implement this Protocol and register in ``sar.registry``.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from aml_filter.domain.sar import SarRecord


@runtime_checkable
class SarRenderer(Protocol):
    """Render a SAR record to JSON and PDF for a jurisdiction/template."""

    content_type_json: str
    content_type_pdf: str

    def render_json(self, record: SarRecord) -> bytes:
        """Serialize the SAR record to a structured JSON byte payload."""
        ...

    def render_pdf(self, record: SarRecord) -> bytes:
        """Render the SAR record to a PDF byte payload in the form layout."""
        ...
