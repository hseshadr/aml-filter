import pytest
from fastapi import FastAPI, Request, Depends, Header
from fastapi.testclient import TestClient
from aml_filter.security.middleware import require_api_key
from aml_filter.api.dependencies import get_db_session
from unittest.mock import AsyncMock, patch
from typing import Optional

app = FastAPI()

# Dummy session for dependency override
async def get_test_db():
    yield AsyncMock()

app.dependency_overrides[get_db_session] = get_test_db

@app.get("/protected")
async def protected(tenant_id: str = Depends(require_api_key)):
    return {"tenant_id": tenant_id}

def test_require_api_key_missing():
    client = TestClient(app)
    response = client.get("/protected")
    assert response.status_code == 401
    assert "API key required" in response.json()["detail"]

@pytest.mark.asyncio
async def test_require_api_key_invalid_format():
    client = TestClient(app)
    # The format check happens before validate_api_key is called
    response = client.get("/protected", headers={"X-API-Key": "invalid"})
    assert response.status_code == 401
    assert "Invalid API key format" in response.json()["detail"]

@pytest.mark.asyncio
async def test_require_api_key_success():
    with patch("aml_filter.security.middleware.validate_api_key", new_callable=AsyncMock) as mock_validate:
        # validate_api_key returns (tenant_id, key_id)
        mock_validate.return_value = ("test-tenant-id", "key-123")
        
        client = TestClient(app)
        response = client.get("/protected", headers={"X-API-Key": "aml_validkeypart"})
        
        assert response.status_code == 200
        assert response.json()["tenant_id"] == "test-tenant-id"

@pytest.mark.asyncio
async def test_require_api_key_invalid_key():
    with patch("aml_filter.security.middleware.validate_api_key", new_callable=AsyncMock) as mock_validate:
        mock_validate.return_value = None
        
        client = TestClient(app)
        response = client.get("/protected", headers={"X-API-Key": "aml_invalidkey"})
        
        assert response.status_code == 401
        assert "Invalid or expired API key" in response.json()["detail"]
