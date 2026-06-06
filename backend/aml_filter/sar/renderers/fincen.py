"""US-FinCEN-shaped SAR renderer.

Produces a structured JSON export and a PDF laid out after the FinCEN SAR form's
parts: Part I (Filing Institution), Part II (Subject Information), Part III
(Suspicious Activity), plus the screening match basis. Uses reportlab's Platypus
layout engine — no hand-rolled PDF bytes.
"""

from __future__ import annotations

import io
from collections.abc import Iterable
from typing import Final

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import StyleSheet1, getSampleStyleSheet
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer

from aml_filter.domain.sar import SarRecord, SubjectSnapshot

_TITLE: Final[str] = "FinCEN Suspicious Activity Report"
_NO_NARRATIVE: Final[str] = "(narrative not yet provided)"


class FincenRenderer:
    """Render a SAR record to FinCEN-shaped JSON and PDF artifacts."""

    content_type_json: str = "application/json"
    content_type_pdf: str = "application/pdf"

    def render_json(self, record: SarRecord) -> bytes:
        """Serialize the SAR record to a structured JSON byte payload."""
        return record.model_dump_json(indent=2).encode("utf-8")

    def render_pdf(self, record: SarRecord) -> bytes:
        """Render the SAR record to a PDF in the FinCEN form layout."""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, title=_TITLE)
        doc.build(_build_story(record, getSampleStyleSheet()))
        return buffer.getvalue()


def _build_story(record: SarRecord, styles: StyleSheet1) -> list[Flowable]:
    """Assemble the ordered flowables for the FinCEN PDF."""
    story: list[Flowable] = [Paragraph(_TITLE, styles["Title"]), Spacer(1, 12)]
    story.extend(_filing_section(record, styles))
    story.extend(_subject_section(record.subject, styles))
    story.extend(_activity_section(record, styles))
    return story


def _filing_section(record: SarRecord, styles: StyleSheet1) -> list[Flowable]:
    """Part I — the filing institution and officer."""
    lines = [
        f"Filer: {record.filer.name}",
        f"Institution: {record.filer.institution}",
        f"Contact: {record.filer.contact}",
        f"Jurisdiction: {record.jurisdiction.value}",
    ]
    return _section("Part I - Filing Institution", lines, styles)


def _subject_section(subject: SubjectSnapshot, styles: StyleSheet1) -> list[Flowable]:
    """Part II — the customer subject and the matched sanctioned party."""
    lines = [
        f"Subject name: {subject.customer_name}",
        f"Customer reference: {subject.customer_reference}",
        f"Date(s) of birth: {_join(d.isoformat() for d in subject.customer_dob)}",
        f"Identifiers: {_join(subject.customer_identifiers)}",
        f"Matched sanctioned name: {subject.matched_sanctioned_name}",
        f"Source list: {subject.matched_source_list}",
    ]
    return _section("Part II - Subject Information", lines, styles)


def _activity_section(record: SarRecord, styles: StyleSheet1) -> list[Flowable]:
    """Part III — the suspicious activity narrative and the match basis."""
    subject = record.subject
    lines = [
        f"Match tier: {subject.match_tier}",
        f"Match score: {subject.match_score:.4f}",
        "Narrative:",
        record.suspicious_activity_narrative or _NO_NARRATIVE,
    ]
    return _section("Part III - Suspicious Activity", lines, styles)


def _section(heading: str, lines: list[str], styles: StyleSheet1) -> list[Flowable]:
    """A heading followed by its body paragraphs and trailing space."""
    flowables: list[Flowable] = [Paragraph(heading, styles["Heading2"])]
    flowables.extend(Paragraph(line, styles["Normal"]) for line in lines)
    flowables.append(Spacer(1, 12))
    return flowables


def _join(values: Iterable[str]) -> str:
    """Comma-join an iterable of strings, or a dash when empty."""
    return ", ".join(values) or "-"
