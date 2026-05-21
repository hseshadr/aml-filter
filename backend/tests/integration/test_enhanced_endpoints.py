"""Integration tests for newly added API endpoints (Batch, Weights, Usage, Audit)."""

import pytest

from aml_filter.db.models import ApiKey, Tenant
from aml_filter.security.api_key import hash_api_key


@pytest.mark.integration
class TestAdditionalEndpoints:
    """Integration tests for Batch, Weights, Usage, and Audit endpoints."""

    @pytest.fixture
    async def auth_header(self, db_session):
        """Create a tenant and API key for authentication."""
        tenant = Tenant(tenant_id="test-tenant-456", name="Audit Test Corp", plan="professional")
        db_session.add(tenant)
        await db_session.commit()

        api_key_str = "aml_test-api-key-456"
        api_key = ApiKey(
            key_id="test-key-456",
            tenant_id="test-tenant-456",
            key_hash=hash_api_key(api_key_str),
            name="Test Key",
        )
        db_session.add(api_key)
        await db_session.commit()
        return {"X-API-Key": api_key_str}

    @pytest.mark.asyncio
    async def test_usage_endpoints(self, client, auth_header):
        """Test usage metering endpoints."""
        response = await client.get("/v1/usage", headers=auth_header)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    @pytest.mark.asyncio
    async def test_audit_endpoints(self, client, auth_header):
        """Test audit logging endpoints."""
        # 1. Perform a search to generate audit log
        await client.post(
            "/v1/screen",
            headers=auth_header,
            json={
                "name": "Audit Test",
                "threshold": 0.5,
            },
        )

        # 2. List audit records
        response = await client.get("/v1/audit", headers=auth_header)
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] >= 1

        # 3. Get specific record
        request_id = data["items"][0]["request_id"]
        response = await client.get(f"/v1/audit/{request_id}", headers=auth_header)
        assert response.status_code == 200
        assert response.json()["request_id"] == request_id

    @pytest.mark.asyncio
    async def test_weights_endpoints(self, client, auth_header):
        """Test weights/policy management."""
        # Get current
        response = await client.get("/v1/weights", headers=auth_header)
        assert response.status_code == 200

        # Update policy
        response = await client.put(
            "/v1/weights",
            headers=auth_header,
            json={"preset": "strict", "name": "Strict Compliance"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["preset"] == "strict"
        assert data["name"] == "Strict Compliance"

        # List history
        response = await client.get("/v1/weights/history", headers=auth_header)
        assert response.status_code == 200
        assert len(response.json()) >= 1

    @pytest.mark.asyncio
    async def test_batch_endpoints(self, client, auth_header):
        """Test batch processing endpoints."""
        # Submit a small batch
        import io

        csv_content = "name,country\nJohn Doe,US\nJane Smith,CA"
        files = {"file": ("test.csv", io.BytesIO(csv_content.encode()), "text/csv")}

        response = await client.post("/v1/batch", headers=auth_header, files=files)
        assert response.status_code == 201
        job_id = response.json()["job_id"]

        # Get status
        response = await client.get(f"/v1/batch/{job_id}", headers=auth_header)
        assert response.status_code == 200
        assert response.json()["job_id"] == job_id

        # List jobs
        response = await client.get("/v1/batch", headers=auth_header)
        assert response.status_code == 200
        assert any(j["job_id"] == job_id for j in response.json())
