import pytest


@pytest.mark.integration
class TestWhitelistAPI:
    """Integration tests for Whitelist Management API."""

    @pytest.fixture
    async def auth_headers(self, db_session, test_tenant):
        """Headers with a valid API key for the test tenant."""
        from aml_filter.security.api_key import create_api_key

        key_id, plaintext = await create_api_key(db_session, test_tenant.tenant_id, name="Test Key")
        return {"X-API-Key": plaintext}

    @pytest.mark.asyncio
    async def test_crud_customers(self, client, auth_headers):
        """Test CRUD operations for whitelist customers."""
        # 1. Create
        payload = {"name": "Target Customer", "country": "US", "dob": ["1990-01-01"]}
        response = await client.post("/v1/whitelist/customers", json=payload, headers=auth_headers)
        assert response.status_code == 201
        customer_id = response.json()["entity_id"]
        assert response.json()["primary_name"] == "Target Customer"

        # 2. List
        response = await client.get("/v1/whitelist/customers", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert any(c["entity_id"] == customer_id for c in data)

        # 3. Get
        response = await client.get(f"/v1/whitelist/customers/{customer_id}", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["primary_name"] == "Target Customer"

        # 4. Update
        update_payload = {"country": "CA"}
        response = await client.put(
            f"/v1/whitelist/customers/{customer_id}", json=update_payload, headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["countries"] == ["CA"]

        # 5. Delete
        response = await client.delete(
            f"/v1/whitelist/customers/{customer_id}", headers=auth_headers
        )
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_trigger_screening(self, client, auth_headers):
        """Test triggering bidirectional screening via API."""
        response = await client.post("/v1/whitelist/screen", headers=auth_headers)
        assert response.status_code == 202
        assert "job_id" in response.json()

    @pytest.mark.asyncio
    async def test_get_matches(self, client, auth_headers):
        """Test GET /v1/whitelist/matches."""
        response = await client.get("/v1/whitelist/matches", headers=auth_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    @pytest.mark.asyncio
    async def test_get_screening_jobs(self, client, auth_headers):
        """Test GET /v1/whitelist/screening-jobs."""
        response = await client.get("/v1/whitelist/screening-jobs", headers=auth_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
