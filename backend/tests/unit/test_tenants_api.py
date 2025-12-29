import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from aml_filter.api.v1.tenants import router
from aml_filter.api.dependencies import get_db_session
from aml_filter.security.middleware import require_api_key
from aml_filter.db.models import Tenant
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, UTC

app = FastAPI()
app.include_router(router, prefix="/v1")

@pytest.mark.asyncio
async def test_create_tenant_success():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    
    # Mock existing tenant check (not found)
    mock_result_none = MagicMock()
    mock_result_none.scalar_one_or_none.return_value = None
    
    # Mock return after add/commit/refresh
    now = datetime.now(UTC)
    mock_tenant = Tenant(
        tenant_id="new-tenant",
        name="New Tenant Corp",
        plan="professional",
        created_at=now,
        updated_at=now
    )
    
    mock_session.execute.return_value = mock_result_none
    
    # Refresh logic mock
    async def mock_refresh(obj):
        obj.created_at = now
        obj.updated_at = now
        
    mock_session.refresh = mock_refresh
    
    payload = {
        "tenant_id": "new-tenant",
        "name": "New Tenant Corp",
        "plan": "professional"
    }
    
    client = TestClient(app)
    response = client.post("/v1/tenants", json=payload)
    
    assert response.status_code == 201
    assert response.json()["tenant_id"] == "new-tenant"
    assert response.json()["plan"] == "professional"

@pytest.mark.asyncio
async def test_create_tenant_conflict():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = MagicMock(spec=Tenant)
    mock_session.execute.return_value = mock_result
    
    payload = {
        "tenant_id": "existing-tenant",
        "name": "Existing",
        "plan": "starter"
    }
    
    client = TestClient(app)
    response = client.post("/v1/tenants", json=payload)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]

@pytest.mark.asyncio
async def test_create_tenant_invalid_plan():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result
    
    payload = {
        "tenant_id": "new-tenant",
        "name": "New",
        "plan": "invalid-plan"
    }
    
    client = TestClient(app)
    response = client.post("/v1/tenants", json=payload)
    assert response.status_code == 400
    assert "Plan must be one of" in response.json()["detail"]

@pytest.mark.asyncio
async def test_get_tenant_success():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"
    
    now = datetime.now(UTC)
    mock_tenant = MagicMock(spec=Tenant)
    mock_tenant.tenant_id = "tenant-123"
    mock_tenant.name = "Tenant 123"
    mock_tenant.plan = "enterprise"
    mock_tenant.created_at = now
    mock_tenant.updated_at = now
    
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_tenant
    mock_session.execute.return_value = mock_result
    
    client = TestClient(app)
    response = client.get("/v1/tenants/tenant-123")
    assert response.status_code == 200
    assert response.json()["tenant_id"] == "tenant-123"

@pytest.mark.asyncio
async def test_get_tenant_forbidden():
    app.dependency_overrides[require_api_key] = lambda: "other-tenant"
    
    client = TestClient(app)
    response = client.get("/v1/tenants/tenant-123")
    assert response.status_code == 403
    assert "Access denied" in response.json()["detail"]

@pytest.mark.asyncio
async def test_list_tenants():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    
    now = datetime.now(UTC)
    mock_tenant = MagicMock(spec=Tenant)
    mock_tenant.tenant_id = "tenant-123"
    mock_tenant.name = "Tenant 123"
    mock_tenant.plan = "enterprise"
    mock_tenant.created_at = now
    mock_tenant.updated_at = now
    
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [mock_tenant]
    mock_session.execute.return_value = mock_result
    
    client = TestClient(app)
    response = client.get("/v1/tenants")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["tenant_id"] == "tenant-123"
