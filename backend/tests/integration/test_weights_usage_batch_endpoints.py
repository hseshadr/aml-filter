"""Integration tests for weights, usage, and batch endpoints."""

import pytest


@pytest.mark.integration
class TestWeightsUsageBatchEndpoints:
    @pytest.mark.asyncio
    async def test_weights_get_and_put(self, client, auth_headers):
        # GET should return a policy (default if none persisted yet)
        resp = await client.get("/v1/weights", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "policy_id" in data
        assert "weights" in data
        assert "threshold" in data

        # PUT should create a new versioned policy
        resp2 = await client.put(
            "/v1/weights",
            headers=auth_headers,
            json={"preset": "strict", "name": "Strict Policy", "threshold": 0.75},
        )
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["preset"] in ("strict", "custom", "balanced", "lenient")

        hist = await client.get("/v1/weights/history", headers=auth_headers)
        assert hist.status_code == 200
        assert isinstance(hist.json(), list)

    @pytest.mark.asyncio
    async def test_usage_endpoint(self, client, auth_headers):
        resp = await client.get("/v1/usage?days=1", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["tenant_id"] == "test-tenant"

    @pytest.mark.asyncio
    async def test_batch_create_and_get(self, client, auth_headers):
        # Upload minimal CSV
        csv_content = "name,country\nJohn Doe,US\nJane Smith,CA\n"
        files = {"file": ("batch.csv", csv_content.encode("utf-8"), "text/csv")}

        create = await client.post("/v1/batch", headers=auth_headers, files=files)
        assert create.status_code == 201
        job = create.json()
        assert "job_id" in job
        assert job["total_records"] >= 1

        job_id = job["job_id"]
        get_job = await client.get(f"/v1/batch/{job_id}", headers=auth_headers)
        assert get_job.status_code == 200
