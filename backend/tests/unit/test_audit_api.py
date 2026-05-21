from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from aml_filter.api.dependencies import get_db_session
from aml_filter.api.v1.audit import router
from aml_filter.db.models import SearchRequest
from aml_filter.security.middleware import require_api_key

app = FastAPI()
app.include_router(router, prefix="/v1")


@pytest.mark.asyncio
async def test_list_audit_records():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"

    # Mock total count
    mock_count_result = MagicMock()
    mock_count_result.scalar.return_value = 1

    # Mock records
    now = datetime.now(UTC)
    mock_record = MagicMock(spec=SearchRequest)
    mock_record.request_id = "req-1"
    mock_record.tenant_id = "tenant-123"
    mock_record.user_id = "user-1"
    mock_record.request_hash = "hash-1"
    mock_record.query = {"name": "Test"}
    mock_record.policy_version = 1
    mock_record.list_versions_used = {"OFAC": "v1"}
    mock_record.matches = {"matches": []}
    mock_record.created_at = now
    mock_record.execution_time_ms = 100

    mock_records_result = MagicMock()
    mock_records_result.scalars.return_value.all.return_value = [mock_record]

    mock_session.execute.side_effect = [mock_count_result, mock_records_result]

    client = TestClient(app)
    response = client.get("/v1/audit?user_id=user-1")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["request_id"] == "req-1"


@pytest.mark.asyncio
async def test_get_audit_record_success():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"

    now = datetime.now(UTC)
    mock_record = MagicMock(spec=SearchRequest)
    mock_record.request_id = "req-1"
    mock_record.tenant_id = "tenant-123"
    mock_record.user_id = "user-1"
    mock_record.request_hash = "hash-1"
    mock_record.query = {"name": "Test"}
    mock_record.policy_version = 1
    mock_record.list_versions_used = {"OFAC": "v1"}
    mock_record.matches = {"matches": []}
    mock_record.created_at = now
    mock_record.execution_time_ms = 100

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_record
    mock_session.execute.return_value = mock_result

    client = TestClient(app)
    response = client.get("/v1/audit/req-1")

    assert response.status_code == 200
    assert response.json()["request_id"] == "req-1"


@pytest.mark.asyncio
async def test_get_audit_record_not_found():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    client = TestClient(app)
    response = client.get("/v1/audit/req-none")

    assert response.status_code == 404
    assert "not found" in response.json()["detail"]
