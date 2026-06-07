"""Extended unit tests for worker/screening_jobs.py - comprehensive coverage."""

import os
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import ScreeningJob, Tenant
from aml_filter.worker.screening_jobs import (
    run_bidirectional_screening,
    screen_blacklist_on_whitelist_update,
    screen_whitelist_on_blacklist_update,
)


class TestScreenWhitelistOnBlacklistUpdate:
    """Tests for screen_whitelist_on_blacklist_update function."""

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test"})
    @patch("aml_filter.worker.screening_jobs.create_database")
    @patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
    async def test_successful_screening_new_job(self, mock_service_class, mock_create_db):
        """Test successful screening creates a new job and completes."""
        mock_session = AsyncMock()
        mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
            mock_session
        )

        # Mock result for finding the job (new job, so None)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        # Track added objects
        added_objects = []
        mock_session.add = MagicMock(side_effect=added_objects.append)

        mock_service = AsyncMock()
        mock_service_class.return_value = mock_service
        mock_service.screen_whitelist_against_blacklist.return_value = {
            "entities_scanned": 10,
            "matches_found": 2,
        }

        result = await screen_whitelist_on_blacklist_update(
            tenant_id="tenant-1",
            list_id="OFAC_SDN",
            list_version="v2024-01",
            use_delta=False,  # exercise the full-rescan fallback explicitly
        )

        assert result["status"] == "completed"
        assert result["entities_scanned"] == 10
        assert result["matches_found"] == 2
        assert "job_id" in result

        # Verify job was created with correct attributes
        assert len(added_objects) == 1
        job = added_objects[0]
        assert job.tenant_id == "tenant-1"
        assert job.job_type == "WHITELIST_SCAN"
        assert job.trigger_type == "LIST_UPDATE"
        assert job.list_id == "OFAC_SDN"
        assert job.list_version == "v2024-01"
        assert job.status == "COMPLETED"

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test"})
    @patch("aml_filter.worker.screening_jobs.create_database")
    @patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
    async def test_existing_job_update(self, mock_service_class, mock_create_db):
        """Test screening with existing job ID updates that job."""
        mock_session = AsyncMock()
        mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
            mock_session
        )

        # Mock existing job
        existing_job = MagicMock(spec=ScreeningJob)
        existing_job.job_id = "existing-job-123"
        existing_job.status = "PENDING"
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing_job
        mock_session.execute.return_value = mock_result

        mock_service = AsyncMock()
        mock_service_class.return_value = mock_service
        mock_service.screen_whitelist_against_blacklist.return_value = {
            "entities_scanned": 5,
            "matches_found": 1,
        }

        result = await screen_whitelist_on_blacklist_update(
            tenant_id="tenant-1", job_id="existing-job-123"
        )

        assert result["status"] == "completed"
        assert result["job_id"] == "existing-job-123"
        assert existing_job.status == "COMPLETED"
        assert existing_job.entities_scanned == 5
        assert existing_job.matches_found == 1

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test"})
    @patch("aml_filter.worker.screening_jobs.create_database")
    @patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
    async def test_screening_failure_updates_job(self, mock_service_class, mock_create_db):
        """Test that screening failure updates job with error."""
        mock_session = AsyncMock()
        mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
            mock_session
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        added_objects = []
        mock_session.add = MagicMock(side_effect=added_objects.append)

        mock_service = AsyncMock()
        mock_service_class.return_value = mock_service
        mock_service.screen_whitelist_against_blacklist.side_effect = ValueError(
            "Database connection failed"
        )

        result = await screen_whitelist_on_blacklist_update(tenant_id="tenant-1")

        assert result["status"] == "failed"
        assert "error" in result
        assert "Database connection failed" in result["error"]

        # Job should be marked as failed
        job = added_objects[0]
        assert job.status == "FAILED"
        assert "Database connection failed" in job.error_message

    @pytest.mark.asyncio
    async def test_missing_database_url_raises_error(self):
        """Test that missing DATABASE_URL raises RuntimeError."""
        # Clear the environment variable
        with patch(
            "aml_filter.worker.screening_jobs.get_settings",
            return_value=MagicMock(database_url=None),
        ):
            with pytest.raises(RuntimeError, match="DATABASE_URL"):
                await screen_whitelist_on_blacklist_update(tenant_id="tenant-1")

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test"})
    @patch("aml_filter.worker.screening_jobs.create_database")
    @patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
    async def test_screening_with_all_parameters(self, mock_service_class, mock_create_db):
        """Test screening with all parameters passed."""
        mock_session = AsyncMock()
        mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
            mock_session
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        mock_session.add = MagicMock()

        mock_service = AsyncMock()
        mock_service_class.return_value = mock_service
        mock_service.screen_whitelist_against_blacklist.return_value = {
            "entities_scanned": 100,
            "matches_found": 10,
        }

        result = await screen_whitelist_on_blacklist_update(
            tenant_id="tenant-abc",
            list_id="EU_SANCTIONS",
            list_version="v2024-06-15",
            job_id=None,  # New job
            use_delta=False,  # exercise the full-rescan fallback explicitly
        )

        # Verify service was called with correct parameters
        mock_service.screen_whitelist_against_blacklist.assert_called_once_with(
            tenant_id="tenant-abc",
            list_id="EU_SANCTIONS",
            list_version="v2024-06-15",
            threshold=0.65,
            batch_size=100,
        )


class TestScreenBlacklistOnWhitelistUpdate:
    """Tests for screen_blacklist_on_whitelist_update function."""

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test"})
    @patch("aml_filter.worker.screening_jobs.create_database")
    @patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
    async def test_screen_all_blacklists(self, mock_service_class, mock_create_db):
        """Test screening all blacklists against whitelist."""
        mock_session = AsyncMock()
        mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
            mock_session
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        mock_session.add = MagicMock()

        mock_service = AsyncMock()
        mock_service_class.return_value = mock_service
        mock_service.screen_whitelist_against_blacklist.return_value = {
            "entities_scanned": 50,
            "matches_found": 3,
        }

        result = await screen_blacklist_on_whitelist_update(tenant_id="tenant-1")

        assert result["status"] == "completed"
        assert result["entities_scanned"] == 50
        assert result["matches_found"] == 3

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test"})
    @patch("aml_filter.worker.screening_jobs.create_database")
    @patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
    async def test_screen_specific_entity(self, mock_service_class, mock_create_db):
        """Test screening a specific whitelist entity."""
        mock_session = AsyncMock()
        mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
            mock_session
        )

        # Mock the entity lookup
        mock_entity = MagicMock(spec=DBEntity)
        mock_entity.entity_id = "whitelist-entity-123"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_entity
        mock_session.execute.return_value = mock_result

        mock_session.add = MagicMock()

        mock_service = AsyncMock()
        mock_service_class.return_value = mock_service
        mock_service.screen_entity_against_list.return_value = ["match-1", "match-2"]

        result = await screen_blacklist_on_whitelist_update(
            tenant_id="tenant-1",
            whitelist_entity_id="whitelist-entity-123",
        )

        assert result["status"] == "completed"
        assert result["entities_scanned"] == 1
        assert result["matches_found"] == 2

        # Verify service was called correctly
        mock_service.screen_entity_against_list.assert_called_once()
        call_kwargs = mock_service.screen_entity_against_list.call_args.kwargs
        assert call_kwargs["entity"] == mock_entity
        assert call_kwargs["target_risk_category"] == "SANCTION"
        assert call_kwargs["threshold"] == 0.65
        assert call_kwargs["match_type"] == "WHITELIST_VS_BLACKLIST"

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test"})
    @patch("aml_filter.worker.screening_jobs.create_database")
    @patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
    async def test_screen_entity_not_found(self, mock_service_class, mock_create_db):
        """Test screening when specific entity is not found."""
        mock_session = AsyncMock()
        mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
            mock_session
        )

        # Entity not found
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        mock_session.add = MagicMock()

        mock_service = AsyncMock()
        mock_service_class.return_value = mock_service

        result = await screen_blacklist_on_whitelist_update(
            tenant_id="tenant-1",
            whitelist_entity_id="nonexistent-entity",
        )

        assert result["status"] == "completed"
        assert result["entities_scanned"] == 0
        assert result["matches_found"] == 0

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test"})
    @patch("aml_filter.worker.screening_jobs.create_database")
    @patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
    async def test_existing_job_updates(self, mock_service_class, mock_create_db):
        """Test that existing job is updated correctly."""
        mock_session = AsyncMock()
        mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
            mock_session
        )

        existing_job = MagicMock(spec=ScreeningJob)
        existing_job.job_id = "job-456"
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing_job
        mock_session.execute.return_value = mock_result

        mock_service = AsyncMock()
        mock_service_class.return_value = mock_service
        mock_service.screen_whitelist_against_blacklist.return_value = {
            "entities_scanned": 20,
            "matches_found": 5,
        }

        result = await screen_blacklist_on_whitelist_update(tenant_id="tenant-1", job_id="job-456")

        assert result["job_id"] == "job-456"
        assert existing_job.status == "COMPLETED"
        assert existing_job.entities_scanned == 20
        assert existing_job.matches_found == 5

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test"})
    @patch("aml_filter.worker.screening_jobs.create_database")
    @patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
    async def test_failure_handling(self, mock_service_class, mock_create_db):
        """Test failure handling updates job status."""
        mock_session = AsyncMock()
        mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
            mock_session
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        added_objects = []
        mock_session.add = MagicMock(side_effect=added_objects.append)

        mock_service = AsyncMock()
        mock_service_class.return_value = mock_service
        mock_service.screen_whitelist_against_blacklist.side_effect = RuntimeError(
            "Service unavailable"
        )

        result = await screen_blacklist_on_whitelist_update(tenant_id="tenant-1")

        assert result["status"] == "failed"
        assert "Service unavailable" in result["error"]

        job = added_objects[0]
        assert job.status == "FAILED"

    @pytest.mark.asyncio
    async def test_missing_database_url(self):
        """Test missing DATABASE_URL raises error."""
        with patch(
            "aml_filter.worker.screening_jobs.get_settings",
            return_value=MagicMock(database_url=None),
        ):
            with pytest.raises(RuntimeError, match="DATABASE_URL"):
                await screen_blacklist_on_whitelist_update(tenant_id="tenant-1")


class TestRunBidirectionalScreening:
    """Tests for run_bidirectional_screening function."""

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test"})
    @patch("aml_filter.worker.screening_jobs.create_database")
    @patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
    async def test_specific_tenant(self, mock_service_class, mock_create_db):
        """Test bidirectional screening for specific tenant."""
        mock_session = AsyncMock()
        mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
            mock_session
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        mock_session.add = MagicMock()

        mock_service = AsyncMock()
        mock_service_class.return_value = mock_service
        mock_service.screen_whitelist_against_blacklist.return_value = {
            "entities_scanned": 100,
            "matches_found": 10,
        }

        result = await run_bidirectional_screening(tenant_id="specific-tenant")

        assert result["status"] == "completed"
        assert result["entities_scanned"] == 100
        assert result["matches_found"] == 10

        # Should only call once for specific tenant
        mock_service.screen_whitelist_against_blacklist.assert_called_once_with(
            tenant_id="specific-tenant",
            threshold=0.65,
            batch_size=100,
        )

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test"})
    @patch("aml_filter.worker.screening_jobs.create_database")
    @patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
    async def test_all_tenants(self, mock_service_class, mock_create_db):
        """Test bidirectional screening for all tenants."""
        mock_session = AsyncMock()
        mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
            mock_session
        )

        # Mock tenants
        tenant1 = MagicMock(spec=Tenant)
        tenant1.tenant_id = "tenant-1"
        tenant2 = MagicMock(spec=Tenant)
        tenant2.tenant_id = "tenant-2"
        tenant3 = MagicMock(spec=Tenant)
        tenant3.tenant_id = "tenant-3"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_result.scalars.return_value.all.return_value = [tenant1, tenant2, tenant3]
        mock_session.execute.return_value = mock_result

        mock_session.add = MagicMock()

        mock_service = AsyncMock()
        mock_service_class.return_value = mock_service
        mock_service.screen_whitelist_against_blacklist.return_value = {
            "entities_scanned": 10,
            "matches_found": 2,
        }

        result = await run_bidirectional_screening(tenant_id=None)

        assert result["status"] == "completed"
        assert result["entities_scanned"] == 30  # 10 * 3 tenants
        assert result["matches_found"] == 6  # 2 * 3 tenants

        # Should be called for each tenant
        assert mock_service.screen_whitelist_against_blacklist.call_count == 3

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test"})
    @patch("aml_filter.worker.screening_jobs.create_database")
    @patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
    async def test_no_tenants(self, mock_service_class, mock_create_db):
        """Test bidirectional screening with no tenants."""
        mock_session = AsyncMock()
        mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
            mock_session
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_result.scalars.return_value.all.return_value = []  # No tenants
        mock_session.execute.return_value = mock_result

        mock_session.add = MagicMock()

        mock_service = AsyncMock()
        mock_service_class.return_value = mock_service

        result = await run_bidirectional_screening(tenant_id=None)

        assert result["status"] == "completed"
        assert result["entities_scanned"] == 0
        assert result["matches_found"] == 0

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test"})
    @patch("aml_filter.worker.screening_jobs.create_database")
    @patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
    async def test_existing_job_with_id(self, mock_service_class, mock_create_db):
        """Test bidirectional screening with existing job ID."""
        mock_session = AsyncMock()
        mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
            mock_session
        )

        existing_job = MagicMock(spec=ScreeningJob)
        existing_job.job_id = "existing-bidir-job"
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing_job
        mock_session.execute.return_value = mock_result

        mock_service = AsyncMock()
        mock_service_class.return_value = mock_service
        mock_service.screen_whitelist_against_blacklist.return_value = {
            "entities_scanned": 50,
            "matches_found": 5,
        }

        result = await run_bidirectional_screening(
            tenant_id="tenant-1", job_id="existing-bidir-job"
        )

        assert result["job_id"] == "existing-bidir-job"
        assert existing_job.status == "COMPLETED"

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test"})
    @patch("aml_filter.worker.screening_jobs.create_database")
    @patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
    async def test_failure_during_screening(self, mock_service_class, mock_create_db):
        """Test failure handling during bidirectional screening."""
        mock_session = AsyncMock()
        mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
            mock_session
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        added_objects = []
        mock_session.add = MagicMock(side_effect=added_objects.append)

        mock_service = AsyncMock()
        mock_service_class.return_value = mock_service
        mock_service.screen_whitelist_against_blacklist.side_effect = Exception("Critical failure")

        result = await run_bidirectional_screening(tenant_id="tenant-1")

        assert result["status"] == "failed"
        assert "Critical failure" in result["error"]

        job = added_objects[0]
        assert job.status == "FAILED"
        assert job.error_message is not None

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test"})
    @patch("aml_filter.worker.screening_jobs.create_database")
    @patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
    async def test_new_job_attributes(self, mock_service_class, mock_create_db):
        """Test new job is created with correct attributes."""
        mock_session = AsyncMock()
        mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
            mock_session
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        added_objects = []
        mock_session.add = MagicMock(side_effect=added_objects.append)

        mock_service = AsyncMock()
        mock_service_class.return_value = mock_service
        mock_service.screen_whitelist_against_blacklist.return_value = {
            "entities_scanned": 25,
            "matches_found": 3,
        }

        await run_bidirectional_screening(tenant_id="my-tenant")

        job = added_objects[0]
        assert job.tenant_id == "my-tenant"
        assert job.job_type == "BIDIRECTIONAL"
        assert job.trigger_type == "MANUAL"

    @pytest.mark.asyncio
    async def test_missing_database_url(self):
        """Test missing DATABASE_URL raises error."""
        with patch(
            "aml_filter.worker.screening_jobs.get_settings",
            return_value=MagicMock(database_url=None),
        ):
            with pytest.raises(RuntimeError, match="DATABASE_URL"):
                await run_bidirectional_screening(tenant_id="tenant-1")


class TestJobTimestamps:
    """Test job timestamps are correctly set."""

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test"})
    @patch("aml_filter.worker.screening_jobs.create_database")
    @patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
    async def test_started_at_set_on_creation(self, mock_service_class, mock_create_db):
        """Test started_at is set when job is created."""
        mock_session = AsyncMock()
        mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
            mock_session
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        added_objects = []
        mock_session.add = MagicMock(side_effect=added_objects.append)

        mock_service = AsyncMock()
        mock_service_class.return_value = mock_service
        mock_service.screen_whitelist_against_blacklist.return_value = {
            "entities_scanned": 10,
            "matches_found": 1,
        }

        before_call = datetime.now(UTC)
        await screen_whitelist_on_blacklist_update(tenant_id="tenant-1")
        after_call = datetime.now(UTC)

        job = added_objects[0]
        assert job.started_at is not None
        assert before_call <= job.started_at <= after_call

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test"})
    @patch("aml_filter.worker.screening_jobs.create_database")
    @patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
    async def test_completed_at_set_on_success(self, mock_service_class, mock_create_db):
        """Test completed_at is set when job succeeds."""
        mock_session = AsyncMock()
        mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
            mock_session
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        added_objects = []
        mock_session.add = MagicMock(side_effect=added_objects.append)

        mock_service = AsyncMock()
        mock_service_class.return_value = mock_service
        mock_service.screen_whitelist_against_blacklist.return_value = {
            "entities_scanned": 10,
            "matches_found": 1,
        }

        await screen_whitelist_on_blacklist_update(tenant_id="tenant-1")

        job = added_objects[0]
        assert job.completed_at is not None

    @pytest.mark.asyncio
    @patch.dict(os.environ, {"DATABASE_URL": "postgresql+asyncpg://test:test@localhost/test"})
    @patch("aml_filter.worker.screening_jobs.create_database")
    @patch("aml_filter.worker.screening_jobs.BidirectionalScreeningService")
    async def test_completed_at_set_on_failure(self, mock_service_class, mock_create_db):
        """Test completed_at is set even when job fails."""
        mock_session = AsyncMock()
        mock_create_db.return_value.async_session_maker.return_value.__aenter__.return_value = (
            mock_session
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        added_objects = []
        mock_session.add = MagicMock(side_effect=added_objects.append)

        mock_service = AsyncMock()
        mock_service_class.return_value = mock_service
        mock_service.screen_whitelist_against_blacklist.side_effect = Exception("Failed")

        await screen_whitelist_on_blacklist_update(tenant_id="tenant-1")

        job = added_objects[0]
        assert job.completed_at is not None
        assert job.status == "FAILED"
