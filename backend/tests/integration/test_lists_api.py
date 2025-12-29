import pytest
from fastapi.testclient import TestClient
from aml_filter.db.models import Tenant, ApiKey, TenantListConfig
from sqlalchemy import select

@pytest.mark.integration
class TestListsAPI:
    """Integration tests for List Management API."""

    @pytest.fixture
    async def auth_headers(self, db_session, test_tenant):
        """Headers with a valid API key for the test tenant."""
        from aml_filter.security.api_key import create_api_key
        key_id, plaintext = await create_api_key(db_session, test_tenant.tenant_id, name="Test Key")
        return {"X-API-Key": plaintext}

    @pytest.mark.asyncio
    async def test_get_list_configs(self, client, auth_headers):
        """Test GET /v1/lists."""
        response = await client.get("/v1/lists", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_update_list_config(self, client, auth_headers):
        """Test PUT /v1/lists/{list_id}."""
        list_id = "OFAC_SDN"
        payload = {
            "enabled": False,
            "version_override": "2025-01-01"
        }
        response = await client.put(f"/v1/lists/{list_id}", json=payload, headers=auth_headers)
        assert response.status_code == 200
        
        # Verify
        response = await client.get(f"/v1/lists/{list_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["enabled"] is False
        assert data["version_override"] == "2025-01-01"

    @pytest.mark.asyncio
    async def test_upload_custom_list(self, client, auth_headers):
        """Test POST /v1/lists/custom/upload."""
        import io
        csv_content = "name,country\nJohn Doe,US\nJane Smith,UK"
        files = {
            "file": ("test.csv", io.BytesIO(csv_content.encode()), "text/csv")
        }
        params = {
            "list_name": "My Custom List"
        }
        response = await client.post("/v1/lists/custom/upload", params=params, files=files, headers=auth_headers)
        assert response.status_code == 201
        assert "list_id" in response.json()
        assert response.json()["status"] == "active"

