import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from aml_filter.api.v1.api_keys import router
from aml_filter.api.dependencies import get_db_session
from aml_filter.security.middleware import require_api_key
from aml_filter.db.models import ApiKey
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

app = FastAPI()
app.include_router(router, prefix="/v1")

@pytest.mark.asyncio
async def test_create_api_key_endpoint():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    
    now = datetime.utcnow()
    mock_api_key = MagicMock(spec=ApiKey)
    mock_api_key.key_id = "ak-123"
    mock_api_key.name = "Test Key"
    mock_api_key.tenant_id = "tenant-123"
    mock_api_key.created_at = now
    mock_api_key.expires_at = None
    
    with patch("aml_filter.api.v1.api_keys.create_api_key", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = ("ak-123", "aml_plaintext")
        
        mock_result = MagicMock()
        mock_result.scalar_one.return_value = mock_api_key
        mock_session.execute.return_value = mock_result
        
        client = TestClient(app)
        payload = {"name": "Test Key"}
        response = client.post("/v1/api-keys", json=payload)
        
        assert response.status_code == 201
        assert response.json()["key_id"] == "ak-123"
        assert response.json()["api_key"] == "aml_plaintext"

@pytest.mark.asyncio
async def test_list_api_keys_endpoint():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    
    now = datetime.utcnow()
    mock_api_key = MagicMock(spec=ApiKey)
    mock_api_key.key_id = "ak-123"
    mock_api_key.name = "Test Key"
    mock_api_key.tenant_id = "tenant-123"
    mock_api_key.created_at = now
    mock_api_key.expires_at = None
    mock_api_key.revoked_at = None
    mock_api_key.last_used_at = None
    
    with patch("aml_filter.api.v1.api_keys.list_api_keys", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = [mock_api_key]
        
        client = TestClient(app)
        response = client.get("/v1/api-keys")
        
        assert response.status_code == 200
        assert len(response.json()) == 1
        assert response.json()[0]["key_id"] == "ak-123"

@pytest.mark.asyncio
async def test_revoke_api_key_endpoint_success():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    
    with patch("aml_filter.api.v1.api_keys.revoke_api_key", new_callable=AsyncMock) as mock_revoke:
        mock_revoke.return_value = True
        
        client = TestClient(app)
        response = client.delete("/v1/api-keys/ak-123")
        
        assert response.status_code == 204

@pytest.mark.asyncio
async def test_revoke_api_key_endpoint_fail():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    
    with patch("aml_filter.api.v1.api_keys.revoke_api_key", new_callable=AsyncMock) as mock_revoke:
        mock_revoke.return_value = False
        
        client = TestClient(app)
        response = client.delete("/v1/api-keys/ak-none")
        
        assert response.status_code == 404
        assert "not found" in response.json()["detail"]

