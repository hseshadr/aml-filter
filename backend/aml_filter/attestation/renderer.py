"""Render a screening attestation to a JSON or PDF badge artifact.

The PDF is a simple certificate/badge layout (header, subject, screened scope,
result, validity, and the signature block) built with reportlab's Platypus engine —
no hand-rolled PDF bytes. JSON is the canonical read model serialized verbatim.
"""

from __future__ import annotations

import io
from typing import Final

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import StyleSheet1, getSampleStyleSheet
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer

from aml_filter.domain.attestation import AttestationRecord

_TITLE: Final[str] = "Screening Attestation"
_UNSIGNED: Final[str] = "(unsigned — no signing key was configured)"

content_type_json: str = "application/json"
content_type_pdf: str = "application/pdf"


def render_json(record: AttestationRecord) -> bytes:
    """Serialize the attestation record to a structured JSON byte payload."""
    return record.model_dump_json(indent=2).encode("utf-8")


def render_pdf(record: AttestationRecord) -> bytes:
    """Render the attestation to a PDF badge in a simple certificate layout."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, title=_TITLE)
    doc.build(_build_story(record, getSampleStyleSheet()))
    return buffer.getvalue()


def _build_story(record: AttestationRecord, styles: StyleSheet1) -> list[Flowable]:
    """Assemble the ordered flowables for the attestation badge."""
    story: list[Flowable] = [Paragraph(_TITLE, styles["Title"]), Spacer(1, 12)]
    story.extend(_section("Subject", _subject_lines(record), styles))
    story.extend(_section("Screened Against", _list_lines(record), styles))
    story.extend(_section("Result", _result_lines(record), styles))
    story.extend(_section("Signature", _signature_lines(record), styles))
    return story


def _subject_lines(record: AttestationRecord) -> list[str]:
    """Customer subject + screening date / validity window."""
    return [
        f"Customer reference: {record.customer_reference}",
        f"Customer id: {record.customer_id}",
        f"Screened at: {record.screened_at.isoformat()}",
        f"Valid until: {record.valid_until.isoformat()}",
    ]


def _list_lines(record: AttestationRecord) -> list[str]:
    """One line per enabled list and the version it was screened against."""
    if not record.lists_and_versions:
        return ["(no enabled lists)"]
    return [f"{entry.list_id} @ {entry.version}" for entry in record.lists_and_versions]


def _result_lines(record: AttestationRecord) -> list[str]:
    """The result status and match counts."""
    return [
        f"Status: {record.result.status.value}",
        f"Matches: {record.result.match_count}",
        f"Pending: {record.result.pending_count}",
    ]


def _signature_lines(record: AttestationRecord) -> list[str]:
    """The signature block, or an explicit unsigned notice."""
    if record.signature is None:
        return [_UNSIGNED]
    return [
        f"Algorithm: {record.algo}",
        f"Key id: {record.signing_key_id}",
        f"Signature: {record.signature}",
    ]


def _section(heading: str, lines: list[str], styles: StyleSheet1) -> list[Flowable]:
    """A heading followed by its body paragraphs and trailing space."""
    flowables: list[Flowable] = [Paragraph(heading, styles["Heading2"])]
    flowables.extend(Paragraph(line, styles["Normal"]) for line in lines)
    flowables.append(Spacer(1, 12))
    return flowables
