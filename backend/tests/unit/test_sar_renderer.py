"""Unit tests for the SAR renderer registry and the FinCEN-shaped renderer."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime

import pytest
from pypdf import PdfReader

from aml_filter.domain.sar import (
    Filer,
    SarJurisdiction,
    SarRecord,
    SarStatus,
    SarTemplate,
    SubjectSnapshot,
)
from aml_filter.sar.errors import SarRenderError
from aml_filter.sar.registry import get_renderer


def _record(narrative: str | None = "Customer wired funds to a sanctioned party.") -> SarRecord:
    """A complete STRONG-match SAR record for rendering."""
    now = datetime(2026, 6, 6, 12, 0, tzinfo=UTC)
    return SarRecord(
        sar_id="sar-1",
        tenant_id="acme",
        customer_id="cust-1",
        match_id="match-1",
        jurisdiction=SarJurisdiction.US,
        template=SarTemplate.FINCEN,
        subject=SubjectSnapshot(
            customer_reference="REF-1",
            customer_name="Jon Q Customer",
            customer_dob=[date(1980, 1, 2)],
            customer_identifiers=["PASSPORT:X1"],
            matched_sanctioned_name="John Quincy Sanctioned",
            matched_source_list="OFAC_SDN",
            match_score=0.92,
            match_tier="STRONG",
        ),
        suspicious_activity_narrative=narrative,
        filer=Filer(name="Compliance Officer", institution="Acme Bank", contact="aml@acme.test"),
        status=SarStatus.COMPLETED,
        created_by="officer@acme.test",
        created_at=now,
        updated_at=now,
        filed_at=None,
    )


class TestRegistry:
    """get_renderer dispatches on (jurisdiction, template)."""

    def test_should_return_renderer_when_us_fincen_requested(self) -> None:
        # Given / When
        renderer = get_renderer(SarJurisdiction.US, SarTemplate.FINCEN)

        # Then
        assert renderer.content_type_pdf == "application/pdf"
        assert renderer.content_type_json == "application/json"

    def test_should_raise_when_unknown_pair_requested(self) -> None:
        # Given / When / Then
        with pytest.raises(SarRenderError):
            get_renderer(SarJurisdiction.UK, SarTemplate.FINCEN)


class TestFincenJsonRender:
    """The FinCEN renderer emits a structured JSON export."""

    def test_should_roundtrip_all_fields_when_rendering_json(self) -> None:
        # Given
        record = _record()
        renderer = get_renderer(SarJurisdiction.US, SarTemplate.FINCEN)

        # When
        payload = json.loads(renderer.render_json(record).decode("utf-8"))

        # Then
        assert payload["sar_id"] == "sar-1"
        assert payload["jurisdiction"] == "US"
        assert payload["template"] == "FINCEN"
        assert payload["subject"]["matched_sanctioned_name"] == "John Quincy Sanctioned"
        assert payload["subject"]["match_score"] == pytest.approx(0.92)
        assert payload["filer"]["institution"] == "Acme Bank"
        assert payload["suspicious_activity_narrative"].startswith("Customer wired")


class TestFincenPdfRender:
    """The FinCEN renderer emits a non-empty PDF with the expected sections."""

    def test_should_emit_nonempty_pdf_bytes_when_rendering(self) -> None:
        # Given
        renderer = get_renderer(SarJurisdiction.US, SarTemplate.FINCEN)

        # When
        pdf = renderer.render_pdf(_record())

        # Then
        assert pdf.startswith(b"%PDF")
        assert len(pdf) > 1000

    def test_should_contain_fincen_sections_when_rendering_pdf(self) -> None:
        # Given
        renderer = get_renderer(SarJurisdiction.US, SarTemplate.FINCEN)

        # When
        pdf = renderer.render_pdf(_record())
        text = _extract_text(pdf)

        # Then
        assert "FinCEN Suspicious Activity Report" in text
        assert "Part I" in text
        assert "Part II" in text
        assert "Part III" in text
        assert "John Quincy Sanctioned" in text
        assert "OFAC_SDN" in text
        assert "Acme Bank" in text
        assert "Customer wired funds" in text


def _extract_text(pdf: bytes) -> str:
    """Extract all text from a rendered PDF for section assertions."""
    import io

    reader = PdfReader(io.BytesIO(pdf))
    return "\n".join(page.extract_text() for page in reader.pages)
