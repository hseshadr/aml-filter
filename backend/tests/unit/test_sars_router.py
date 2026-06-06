"""Unit tests for the SAR router — error mapping and export response shaping."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from aml_filter.api.dependencies import get_db_session
from aml_filter.api.v1.sars import router
from aml_filter.db.models import Sar
from aml_filter.sar.errors import SarGatingError
from aml_filter.security.middleware import require_api_key

app = FastAPI()
app.include_router(router, prefix="/v1")

_FILER = {"name": "Officer", "institution": "Acme Bank", "contact": "aml@acme.test"}
_SUBJECT = {
    "customer_reference": "REF-1",
    "customer_name": "Jon Q Customer",
    "customer_dob": [],
    "customer_identifiers": [],
    "matched_sanctioned_name": "John Quincy Sanctioned",
    "matched_source_list": "OFAC_SDN",
    "match_score": 0.92,
    "match_tier": "STRONG",
}


def _sar(status: str = "COMPLETED") -> Sar:
    """A fully-populated SAR row stand-in for router responses."""
    now = datetime(2026, 6, 6, tzinfo=UTC)
    return Sar(
        sar_id="sar-1",
        tenant_id="acme",
        customer_id="cust-1",
        match_id="match-1",
        jurisdiction="US",
        template="FINCEN",
        subject=dict(_SUBJECT),
        suspicious_activity_narrative="A story.",
        filer=dict(_FILER),
        status=status,
        created_by="officer",
        created_at=now,
        updated_at=now,
        filed_at=None,
    )


def _mock_session() -> AsyncMock:
    """Provide a throwaway async session stand-in for dependency overrides."""
    return AsyncMock()


def _tenant() -> str:
    """Provide a fixed tenant id for the auth dependency override."""
    return "acme"


def _override() -> None:
    """Override DB + auth dependencies for the router under test."""
    app.dependency_overrides[get_db_session] = _mock_session
    app.dependency_overrides[require_api_key] = _tenant


def _body(narrative: str | None = "A story.") -> dict:
    """A valid create-SAR request body."""
    return {
        "customer_id": "cust-1",
        "match_id": "match-1",
        "narrative": narrative,
        "filer": _FILER,
    }


def test_should_return_401_when_no_api_key() -> None:
    # Given — only the DB is stubbed; the real auth dependency runs with no key
    app.dependency_overrides[get_db_session] = _mock_session

    # When
    resp = TestClient(app).post("/v1/sars", json=_body())

    # Then
    assert resp.status_code == 401


def test_should_create_when_service_succeeds() -> None:
    # Given
    _override()
    with patch("aml_filter.api.v1.sars.SarService") as svc:
        svc.return_value.create = AsyncMock(return_value=_sar())

        # When
        resp = TestClient(app).post("/v1/sars", json=_body())

    # Then
    assert resp.status_code == 201
    assert resp.json()["subject"]["matched_source_list"] == "OFAC_SDN"


def test_should_map_gating_error_to_422_on_create() -> None:
    # Given
    _override()
    with patch("aml_filter.api.v1.sars.SarService") as svc:
        svc.return_value.create = AsyncMock(side_effect=SarGatingError("not strong"))

        # When
        resp = TestClient(app).post("/v1/sars", json=_body())

    # Then
    assert resp.status_code == 422
    assert "not strong" in resp.json()["detail"]


def test_should_list_sars() -> None:
    # Given
    _override()
    with patch("aml_filter.api.v1.sars.SarService") as svc:
        svc.return_value.list = AsyncMock(return_value=[_sar()])

        # When
        resp = TestClient(app).get("/v1/sars")

    # Then
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_should_return_404_when_get_missing() -> None:
    # Given
    _override()
    with patch("aml_filter.api.v1.sars.SarService") as svc:
        svc.return_value.get = AsyncMock(return_value=None)

        # When
        resp = TestClient(app).get("/v1/sars/nope")

    # Then
    assert resp.status_code == 404


def test_should_get_sar() -> None:
    # Given
    _override()
    with patch("aml_filter.api.v1.sars.SarService") as svc:
        svc.return_value.get = AsyncMock(return_value=_sar())

        # When
        resp = TestClient(app).get("/v1/sars/sar-1")

    # Then
    assert resp.status_code == 200
    assert resp.json()["sar_id"] == "sar-1"


def test_should_map_gating_error_to_422_on_update() -> None:
    # Given
    _override()
    with patch("aml_filter.api.v1.sars.SarService") as svc:
        svc.return_value.get = AsyncMock(return_value=_sar())
        svc.return_value.update = AsyncMock(side_effect=SarGatingError("narrative required"))

        # When
        resp = TestClient(app).put("/v1/sars/sar-1", json={"status": "COMPLETED"})

    # Then
    assert resp.status_code == 422


def test_should_update_sar() -> None:
    # Given
    _override()
    with patch("aml_filter.api.v1.sars.SarService") as svc:
        svc.return_value.get = AsyncMock(return_value=_sar())
        svc.return_value.update = AsyncMock(return_value=_sar())

        # When
        resp = TestClient(app).put("/v1/sars/sar-1", json={"narrative": "Updated."})

    # Then
    assert resp.status_code == 200


def test_should_export_json_and_mark_exported() -> None:
    # Given
    _override()
    with patch("aml_filter.api.v1.sars.SarService") as svc:
        svc.return_value.get = AsyncMock(return_value=_sar())
        svc.return_value.mark_exported = AsyncMock()

        # When
        resp = TestClient(app).get("/v1/sars/sar-1/export?format=json")

    # Then
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/json")
    svc.return_value.mark_exported.assert_awaited_once()


def test_should_export_pdf_with_attachment_header() -> None:
    # Given
    _override()
    with patch("aml_filter.api.v1.sars.SarService") as svc:
        svc.return_value.get = AsyncMock(return_value=_sar())
        svc.return_value.mark_exported = AsyncMock()

        # When
        resp = TestClient(app).get("/v1/sars/sar-1/export?format=pdf")

    # Then
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert "attachment" in resp.headers["content-disposition"]
    assert resp.content.startswith(b"%PDF")


def test_should_return_404_when_export_missing() -> None:
    # Given
    _override()
    with patch("aml_filter.api.v1.sars.SarService") as svc:
        svc.return_value.get = AsyncMock(return_value=None)

        # When
        resp = TestClient(app).get("/v1/sars/nope/export?format=pdf")

    # Then
    assert resp.status_code == 404


@pytest.fixture(autouse=True)
def _clear_overrides() -> None:
    """Reset dependency overrides between tests."""
    yield
    app.dependency_overrides.clear()
