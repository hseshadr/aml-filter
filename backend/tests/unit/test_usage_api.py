"""Unit tests for Usage API."""

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from aml_filter.api.main import app
from aml_filter.api.dependencies import get_db_session
from aml_filter.security.middleware import require_api_key

@pytest.fixture
def mock_session():
    return AsyncMock()

@pytest.fixture
def client(mock_session):
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "test-tenant-id"
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_get_usage_basic(client, mock_session):
    """Test get_usage with no parameters."""
    with patch("aml_filter.api.v1.usage.get_usage_summary", new_callable=AsyncMock) as mock_summary, \
         patch("aml_filter.api.v1.usage.get_usage_count", new_callable=AsyncMock) as mock_count:
        
        mock_summary.return_value = {"screen": 100}
        mock_count.return_value = 100
        
        response = client.get("/v1/usage")
        assert response.status_code == 200
        data = response.json()
        assert data["tenant_id"] == "test-tenant-id"
        assert data["summary"] == {"screen": 100}
        assert data["total_units"] == 100
        assert data["period_start"] is None
        assert data["period_end"] is None

@pytest.mark.asyncio
async def test_get_usage_with_days(client, mock_session):
    """Test get_usage with days parameter."""
    with patch("aml_filter.api.v1.usage.get_usage_summary", new_callable=AsyncMock) as mock_summary, \
         patch("aml_filter.api.v1.usage.get_usage_count", new_callable=AsyncMock) as mock_count:
        
        mock_summary.return_value = {"screen": 50}
        mock_count.return_value = 50
        
        response = client.get("/v1/usage?days=7")
        assert response.status_code == 200
        data = response.json()
        assert data["period_start"] is not None
        assert data["period_end"] is not None

@pytest.mark.asyncio
async def test_get_usage_with_iso_dates(client, mock_session):
    """Test get_usage with ISO date strings."""
    with patch("aml_filter.api.v1.usage.get_usage_summary", new_callable=AsyncMock) as mock_summary, \
         patch("aml_filter.api.v1.usage.get_usage_count", new_callable=AsyncMock) as mock_count:
        
        mock_summary.return_value = {"api_key": 5}
        mock_count.return_value = 5
        
        start = "2024-01-01T00:00:00Z"
        end = "2024-01-31T23:59:59Z"
        response = client.get(f"/v1/usage?start_date={start}&end_date={end}")
        assert response.status_code == 200
        data = response.json()
        assert "2024-01-01" in data["period_start"]
        assert "2024-01-31" in data["period_end"]

