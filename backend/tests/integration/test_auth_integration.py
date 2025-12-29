"""Integration tests for authentication and tenant management."""

import pytest
from aml_filter.db.models import Tenant, ApiKey
from aml_filter.security.api_key import hash_api_key

@pytest.mark.integration
class TestAuthIntegration:
    """Integration tests for authentication endpoints."""

    @pytest.mark.asyncio
    async def test_create_tenant(self, client):
        """Test tenant creation."""
        response = await client.post(
            "/v1/tenants",
            json={
                "tenant_id": "test-tenant-1",
                "name": "Test Tenant",
                "plan": "starter",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["tenant_id"] == "test-tenant-1"
        assert data["name"] == "Test Tenant"
        assert data["plan"] == "starter"

    @pytest.mark.asyncio
    async def test_create_api_key(self, client, db_session):
        """Test API key creation."""
        # Create tenant first
        tenant = Tenant(
            tenant_id="test-tenant-2",
            name="Test Tenant 2",
            plan="starter",
        )
        db_session.add(tenant)
        await db_session.commit()

        # Create API key
        api_key = ApiKey(
            key_id="test-key-1",
            tenant_id="test-tenant-2",
            key_hash=hash_api_key("aml_test-api-key-123"),
            name="Test Key",
        )
        db_session.add(api_key)
        await db_session.commit()

        # Test API key authentication
        response = await client.post(
            "/v1/api-keys",
            headers={"X-API-Key": "aml_test-api-key-123"},
            json={"name": "New Key"},
        )
        assert response.status_code == 201
        data = response.json()
        assert "api_key" in data
        assert data["name"] == "New Key"

    @pytest.mark.asyncio
    async def test_list_tenants(self, client, db_session):
        """Test listing tenants."""
        # Create test tenants
        tenant1 = Tenant(tenant_id="test-1", name="Tenant 1", plan="starter")
        tenant2 = Tenant(tenant_id="test-2", name="Tenant 2", plan="professional")
        db_session.add(tenant1)
        db_session.add(tenant2)
        await db_session.commit()

        response = await client.get("/v1/tenants")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 2
        tenant_ids = [t["tenant_id"] for t in data]
        assert "test-1" in tenant_ids
        assert "test-2" in tenant_ids

    @pytest.mark.asyncio
    async def test_get_tenant(self, client, db_session):
        """Test getting a specific tenant."""
        tenant = Tenant(tenant_id="test-tenant-3", name="Test Tenant 3", plan="enterprise")
        db_session.add(tenant)
        await db_session.commit()

        # Create API key for this tenant
        api_key_str = "aml_test-key-abc"
        api_key = ApiKey(
            key_id="test-key-2",
            tenant_id="test-tenant-3",
            key_hash=hash_api_key(api_key_str),
            name="Test Key",
        )
        db_session.add(api_key)
        await db_session.commit()

        # Test with API key
        response = await client.get(
            "/v1/tenants/test-tenant-3",
            headers={"X-API-Key": api_key_str},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["tenant_id"] == "test-tenant-3"
        assert data["name"] == "Test Tenant 3"
