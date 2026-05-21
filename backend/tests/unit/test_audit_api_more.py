from unittest.mock import AsyncMock, MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from aml_filter.api.dependencies import get_db_session
from aml_filter.api.v1.audit import router
from aml_filter.security.middleware import require_api_key


def _app(mock_session: AsyncMock) -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix="/v1")
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    return TestClient(app)


def test_get_audit_record_not_found() -> None:
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    client = _app(mock_session)
    resp = client.get("/v1/audit/does-not-exist")
    assert resp.status_code == 404


def test_list_audit_records_with_date_filters() -> None:
    mock_session = AsyncMock()

    # count result
    mock_count_result = MagicMock()
    mock_count_result.scalar.return_value = 0

    # records result
    mock_records_result = MagicMock()
    mock_records_result.scalars.return_value.all.return_value = []

    mock_session.execute.side_effect = [mock_count_result, mock_records_result]

    client = _app(mock_session)
    resp = client.get("/v1/audit?start_date=2025-01-01T00:00:00Z&end_date=2025-01-02T00:00:00Z")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []
