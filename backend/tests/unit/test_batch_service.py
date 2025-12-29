import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from aml_filter.batch.service import BatchService
from aml_filter.db.models import BatchJob as DBBatchJob
from aml_filter.domain.search import SearchQuery

@pytest.mark.asyncio
async def test_create_job():
    """Test creating a new batch job."""
    mock_session = AsyncMock()
    mock_search_service = MagicMock()
    service = BatchService(mock_session, mock_search_service)
    
    queries = [
        SearchQuery(name="John Doe"),
        SearchQuery(name="Jane Smith")
    ]
    
    job = await service.create_job(
        tenant_id="tenant_1",
        queries=queries,
        job_name="Monthly Screening"
    )
    
    assert job.tenant_id == "tenant_1"
    assert job.status == "PENDING"
    assert job.total_records == 2
    assert mock_session.add.called
    assert mock_session.commit.called

@pytest.mark.asyncio
async def test_process_job():
    """Test processing a batch job."""
    mock_session = AsyncMock()
    mock_search_service = AsyncMock()
    
    # Mock BatchJob in DB
    job = DBBatchJob(
        job_id="job_123",
        tenant_id="tenant_1",
        status="PENDING",
        total_records=2,
        metadata_json={"queries": [{"name": "John Doe"}, {"name": "Jane Smith"}]}
    )
    
    # Mock result from execute
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = job
    mock_session.execute.return_value = mock_result
    
    # Mock SearchService.search
    mock_response = MagicMock()
    mock_response.request_id = "req_1"
    mock_response.matches = []
    mock_search_service.search.return_value = mock_response
    
    service = BatchService(mock_session, mock_search_service)
    
    await service.process_job("job_123")
    
    assert job.status == "COMPLETED"
    assert job.processed_records == 2
    assert mock_search_service.search.call_count == 2
    assert mock_session.commit.called

@pytest.mark.asyncio
async def test_process_job_failure():
    """Test processing a batch job that fails."""
    mock_session = AsyncMock()
    mock_search_service = AsyncMock()
    
    # Mock BatchJob in DB
    job = DBBatchJob(
        job_id="job_123",
        tenant_id="tenant_1",
        status="PENDING",
        total_records=1,
        metadata_json={"queries": [{"name": "John Doe"}]}
    )
    
    # Mock result from execute
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = job
    mock_session.execute.return_value = mock_result
    
    # Mock SearchService.search to raise exception
    mock_search_service.search.side_effect = Exception("Search failed")
    
    service = BatchService(mock_session, mock_search_service)
    
    await service.process_job("job_123")
    
    assert job.status == "FAILED"
    assert "Search failed" in job.error_message
    assert mock_session.commit.called
