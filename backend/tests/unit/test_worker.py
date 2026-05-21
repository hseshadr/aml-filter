from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aml_filter.db.models import ScreeningJob
from aml_filter.worker.screening_jobs import (
    run_bidirectional_screening,
    screen_blacklist_on_whitelist_update,
    screen_whitelist_on_blacklist_update,
)


@pytest.mark.asyncio
@patch("aml_filter.worker.screening_jobs.create_database")
@patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
async def test_screen_whitelist_on_blacklist_update(mock_service_class, mock_create_db):
    """Test background job for whitelist screening on blacklist update."""
    mock_session = AsyncMock()
    # Mock database.async_session_maker() as a context manager
    mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
        mock_session
    )

    # Mock result for finding the job if job_id is not provided
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    mock_service = AsyncMock()
    mock_service_class.return_value = mock_service
    mock_service.screen_whitelist_against_blacklist.return_value = {
        "entities_scanned": 1,
        "matches_found": 0,
    }

    # Run job
    await screen_whitelist_on_blacklist_update("tenant_1", "OFAC_SDN", "v1")

    # Verify service was called
    mock_service.screen_whitelist_against_blacklist.assert_called_once()


@pytest.mark.asyncio
@patch("aml_filter.worker.screening_jobs.create_database")
@patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
async def test_screen_blacklist_on_whitelist_update(mock_service_class, mock_create_db):
    """Test background job for blacklist screening on whitelist update."""
    mock_session = AsyncMock()
    mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
        mock_session
    )

    # Mock result for finding the job if job_id is not provided
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None

    # We need to handle multiple execute calls in the job
    async def mock_execute(stmt):
        return mock_result

    mock_session.execute.side_effect = mock_execute

    mock_service = AsyncMock()
    mock_service_class.return_value = mock_service
    mock_service.screen_whitelist_against_blacklist.return_value = {
        "entities_scanned": 1,
        "matches_found": 0,
    }

    # Run job - call with tenant_id only to trigger screen_whitelist_against_blacklist
    await screen_blacklist_on_whitelist_update("tenant_1")

    # Verify service was called
    mock_service.screen_whitelist_against_blacklist.assert_called_once()


@pytest.mark.asyncio
@patch("aml_filter.worker.screening_jobs.create_database")
@patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
async def test_screen_whitelist_on_blacklist_update_with_job_id(mock_service_class, mock_create_db):
    """Test background job for whitelist screening with existing job_id."""
    mock_session = AsyncMock()
    mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
        mock_session
    )

    # Mock existing job
    job = MagicMock(spec=ScreeningJob)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = job
    mock_session.execute.return_value = mock_result

    mock_service = AsyncMock()
    mock_service_class.return_value = mock_service
    mock_service.screen_whitelist_against_blacklist.return_value = {
        "entities_scanned": 5,
        "matches_found": 1,
    }

    await screen_whitelist_on_blacklist_update("tenant_1", job_id="job_123")

    assert job.status == "COMPLETED"
    assert job.entities_scanned == 5


@pytest.mark.asyncio
@patch("aml_filter.worker.screening_jobs.create_database")
@patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
async def test_screen_whitelist_on_blacklist_update_failure(mock_service_class, mock_create_db):
    """Test background job failure handling."""
    mock_session = AsyncMock()
    mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
        mock_session
    )

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    mock_service = AsyncMock()
    mock_service_class.return_value = mock_service
    mock_service.screen_whitelist_against_blacklist.side_effect = Exception("Test Error")

    # We need to capture the job object added to session
    added_objects = []
    # AsyncSession.add() is synchronous; ensure our mock behaves synchronously too.
    mock_session.add = MagicMock(side_effect=lambda x: added_objects.append(x))

    await screen_whitelist_on_blacklist_update("tenant_1")

    assert added_objects[0].status == "FAILED"
    assert "Test Error" in added_objects[0].error_message


@pytest.mark.asyncio
@patch("aml_filter.worker.screening_jobs.create_database")
@patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
async def test_screen_blacklist_on_whitelist_update_with_entity(mock_service_class, mock_create_db):
    """Test background job for specific whitelist entity update."""
    mock_session = AsyncMock()
    mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
        mock_session
    )

    # Mock finding the entity
    from aml_filter.db.models import Entity as DBEntity

    entity = MagicMock(spec=DBEntity)
    mock_result = MagicMock()
    # Only one SELECT is performed in this code path (fetching the entity).
    mock_result.scalar_one_or_none.return_value = entity
    mock_session.execute.return_value = mock_result

    mock_service = AsyncMock()
    mock_service_class.return_value = mock_service
    mock_service.screen_entity_against_list.return_value = [MagicMock()]

    await screen_blacklist_on_whitelist_update("tenant_1", whitelist_entity_id="e123")

    mock_service.screen_entity_against_list.assert_called_once()


@pytest.mark.asyncio
@patch("aml_filter.worker.screening_jobs.create_database")
@patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
async def test_run_bidirectional_screening_all_tenants(mock_service_class, mock_create_db):
    """Test manual bidirectional screening for all tenants."""
    mock_session = AsyncMock()
    mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
        mock_session
    )

    # Mock finding tenants
    tenants = [MagicMock(tenant_id="t1"), MagicMock(tenant_id="t2")]
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None  # For job
    mock_result.scalars.return_value.all.return_value = tenants
    mock_session.execute.return_value = mock_result

    mock_service = AsyncMock()
    mock_service_class.return_value = mock_service
    mock_service.screen_whitelist_against_blacklist.return_value = {
        "entities_scanned": 1,
        "matches_found": 0,
    }

    await run_bidirectional_screening(tenant_id=None)

    assert mock_service.screen_whitelist_against_blacklist.call_count == 2
