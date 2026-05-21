import io
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from aml_filter.api.dependencies import get_db_session
from aml_filter.api.v1.batch import router
from aml_filter.db.models import BatchJob
from aml_filter.security.middleware import require_api_key

app = FastAPI()
app.include_router(router, prefix="/v1")


@pytest.mark.asyncio
async def test_create_batch_job_success():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"

    csv_content = "name,country\nJohn Doe,US"
    file = ("test.csv", io.BytesIO(csv_content.encode()), "text/csv")

    now = datetime.now(UTC)
    mock_job = MagicMock(spec=BatchJob)
    mock_job.job_id = "job-123"
    mock_job.tenant_id = "tenant-123"
    mock_job.job_name = "test.csv"
    mock_job.status = "PENDING"
    mock_job.total_records = 1
    mock_job.processed_records = 0
    mock_job.matches_found = 0
    mock_job.created_at = now
    mock_job.started_at = None
    mock_job.completed_at = None
    mock_job.error_message = None

    with (
        patch("aml_filter.api.v1.batch.BatchParser.parse") as mock_parse,
        patch(
            "aml_filter.api.v1.batch.BatchService.create_job", new_callable=AsyncMock
        ) as mock_create,
    ):
        mock_parse.return_value = [{"name": "John Doe", "country": "US"}]
        mock_create.return_value = mock_job

        client = TestClient(app)
        response = client.post("/v1/batch", files={"file": file})

        assert response.status_code == 201
        assert response.json()["job_id"] == "job-123"


@pytest.mark.asyncio
async def test_get_batch_job_success():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"

    now = datetime.now(UTC)
    mock_job = MagicMock(spec=BatchJob)
    mock_job.job_id = "job-123"
    mock_job.tenant_id = "tenant-123"
    mock_job.job_name = "test.csv"
    mock_job.status = "COMPLETED"
    mock_job.total_records = 1
    mock_job.processed_records = 1
    mock_job.matches_found = 0
    mock_job.created_at = now
    mock_job.started_at = now
    mock_job.completed_at = now
    mock_job.error_message = None

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_job
    mock_session.execute.return_value = mock_result

    client = TestClient(app)
    response = client.get("/v1/batch/job-123")

    assert response.status_code == 200
    assert response.json()["status"] == "COMPLETED"


@pytest.mark.asyncio
async def test_list_batch_jobs():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"

    now = datetime.now(UTC)
    mock_job = MagicMock(spec=BatchJob)
    mock_job.job_id = "job-123"
    mock_job.tenant_id = "tenant-123"
    mock_job.job_name = "test.csv"
    mock_job.status = "PENDING"
    mock_job.total_records = 1
    mock_job.processed_records = 0
    mock_job.matches_found = 0
    mock_job.created_at = now
    mock_job.started_at = None
    mock_job.completed_at = None
    mock_job.error_message = None

    with patch(
        "aml_filter.api.v1.batch.BatchService.list_jobs", new_callable=AsyncMock
    ) as mock_list:
        mock_list.return_value = [mock_job]

        client = TestClient(app)
        response = client.get("/v1/batch")

        assert response.status_code == 200
        assert len(response.json()) == 1


@pytest.mark.asyncio
async def test_get_batch_results_success():
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[require_api_key] = lambda: "tenant-123"

    mock_job = MagicMock(spec=BatchJob)
    mock_job.job_id = "job-123"
    mock_job.tenant_id = "tenant-123"
    mock_job.status = "COMPLETED"
    mock_job.metadata_json = {
        "results": [
            {
                "request_id": "r1",
                "matches": [
                    {
                        "entity_id": "e1",
                        "score": 0.9,
                        "risk_category": "PEP",
                        "source_list": "OFAC",
                        "primary_name": "JOHN DOE",
                    }
                ],
            }
        ]
    }

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_job
    mock_session.execute.return_value = mock_result

    client = TestClient(app)
    response = client.get("/v1/batch/job-123/results")

    assert response.status_code == 200
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert "JOHN DOE" in response.text
