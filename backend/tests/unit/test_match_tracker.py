"""Unit tests for MatchTracker service."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from aml_filter.db.models import WhitelistBlacklistMatch
from aml_filter.screening.match_tracker import MatchTracker


class TestMatchTrackerInit:
    """Test MatchTracker initialization."""

    def test_init_with_session(self):
        """Test initialization with session."""
        mock_session = AsyncMock()
        tracker = MatchTracker(session=mock_session)
        assert tracker.session == mock_session


class TestRecordMatch:
    """Test record_match method."""

    @pytest.fixture
    def mock_session(self):
        """Create mock session."""
        return AsyncMock()

    @pytest.fixture
    def tracker(self, mock_session):
        """Create tracker with mock session."""
        return MatchTracker(session=mock_session)

    @pytest.mark.asyncio
    async def test_create_new_match(self, tracker, mock_session):
        """Test creating a new match record."""
        # No existing match
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        result = await tracker.record_match(
            tenant_id="tenant-1",
            whitelist_entity_id="w1",
            blacklist_entity_id="b1",
            match_score=0.85,
            match_type="WHITELIST_VS_BLACKLIST",
            list_version="2024-01",
        )

        # Verify session.add was called
        mock_session.add.assert_called_once()
        added_match = mock_session.add.call_args[0][0]
        assert isinstance(added_match, WhitelistBlacklistMatch)
        assert added_match.tenant_id == "tenant-1"
        assert added_match.whitelist_entity_id == "w1"
        assert added_match.blacklist_entity_id == "b1"
        assert added_match.match_score == 0.85
        assert added_match.match_type == "WHITELIST_VS_BLACKLIST"
        assert added_match.resolution_status == "PENDING"

    @pytest.mark.asyncio
    async def test_update_existing_match(self, tracker, mock_session):
        """Test updating an existing match record."""
        # Existing match
        existing_match = MagicMock(spec=WhitelistBlacklistMatch)
        existing_match.match_id = "existing-match-1"
        existing_match.match_score = 0.70
        existing_match.resolution_status = "FALSE_POSITIVE"
        existing_match.metadata_json = {}

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing_match
        mock_session.execute.return_value = mock_result

        result = await tracker.record_match(
            tenant_id="tenant-1",
            whitelist_entity_id="w1",
            blacklist_entity_id="b1",
            match_score=0.90,  # Updated score
            match_type="WHITELIST_VS_BLACKLIST",
        )

        # Verify existing match was updated
        assert existing_match.match_score == 0.90
        assert existing_match.resolution_status == "PENDING"  # Reset

    @pytest.mark.asyncio
    async def test_record_match_with_metadata(self, tracker, mock_session):
        """Test recording match with metadata."""
        # No existing match
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        metadata = {"signal_details": {"vector_score": 0.9, "trigram_score": 0.85}}

        await tracker.record_match(
            tenant_id="tenant-1",
            whitelist_entity_id="w1",
            blacklist_entity_id="b1",
            match_score=0.85,
            match_type="WHITELIST_VS_BLACKLIST",
            metadata=metadata,
        )

        added_match = mock_session.add.call_args[0][0]
        assert added_match.metadata_json == metadata

    @pytest.mark.asyncio
    async def test_update_existing_match_with_metadata(self, tracker, mock_session):
        """Test updating existing match with new metadata."""
        existing_match = MagicMock(spec=WhitelistBlacklistMatch)
        existing_match.match_id = "existing-match-1"
        # Use a real dict so update() works properly
        existing_match.metadata_json = {"old_key": "old_value"}

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing_match
        mock_session.execute.return_value = mock_result

        new_metadata = {"new_key": "new_value"}

        await tracker.record_match(
            tenant_id="tenant-1",
            whitelist_entity_id="w1",
            blacklist_entity_id="b1",
            match_score=0.85,
            match_type="WHITELIST_VS_BLACKLIST",
            metadata=new_metadata,
        )

        # Verify metadata was updated (merged) - real dict update works
        assert "new_key" in existing_match.metadata_json
        assert existing_match.metadata_json["new_key"] == "new_value"


class TestGetMatch:
    """Test get_match method."""

    @pytest.fixture
    def mock_session(self):
        """Create mock session."""
        return AsyncMock()

    @pytest.fixture
    def tracker(self, mock_session):
        """Create tracker with mock session."""
        return MatchTracker(session=mock_session)

    @pytest.mark.asyncio
    async def test_get_existing_match(self, tracker, mock_session):
        """Test getting an existing match."""
        existing_match = MagicMock(spec=WhitelistBlacklistMatch)
        existing_match.match_id = "match-1"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing_match
        mock_session.execute.return_value = mock_result

        result = await tracker.get_match(
            tenant_id="tenant-1",
            whitelist_entity_id="w1",
            blacklist_entity_id="b1",
        )

        assert result == existing_match

    @pytest.mark.asyncio
    async def test_get_nonexistent_match(self, tracker, mock_session):
        """Test getting a match that doesn't exist."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        result = await tracker.get_match(
            tenant_id="tenant-1",
            whitelist_entity_id="w1",
            blacklist_entity_id="nonexistent",
        )

        assert result is None


class TestGetMatchesForTenant:
    """Test get_matches_for_tenant method."""

    @pytest.fixture
    def mock_session(self):
        """Create mock session."""
        return AsyncMock()

    @pytest.fixture
    def tracker(self, mock_session):
        """Create tracker with mock session."""
        return MatchTracker(session=mock_session)

    @pytest.mark.asyncio
    async def test_get_all_matches(self, tracker, mock_session):
        """Test getting all matches for a tenant."""
        match1 = MagicMock(spec=WhitelistBlacklistMatch)
        match2 = MagicMock(spec=WhitelistBlacklistMatch)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [match1, match2]
        mock_session.execute.return_value = mock_result

        result = await tracker.get_matches_for_tenant(tenant_id="tenant-1")

        assert len(result) == 2
        assert match1 in result
        assert match2 in result

    @pytest.mark.asyncio
    async def test_get_matches_with_resolution_filter(self, tracker, mock_session):
        """Test getting matches with resolution status filter."""
        match = MagicMock(spec=WhitelistBlacklistMatch)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [match]
        mock_session.execute.return_value = mock_result

        result = await tracker.get_matches_for_tenant(
            tenant_id="tenant-1",
            resolution_status="PENDING",
        )

        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_get_matches_with_pagination(self, tracker, mock_session):
        """Test getting matches with limit and offset."""
        matches = [MagicMock(spec=WhitelistBlacklistMatch) for _ in range(5)]

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = matches
        mock_session.execute.return_value = mock_result

        result = await tracker.get_matches_for_tenant(
            tenant_id="tenant-1",
            limit=5,
            offset=10,
        )

        assert len(result) == 5

    @pytest.mark.asyncio
    async def test_get_matches_empty_result(self, tracker, mock_session):
        """Test getting matches when none exist."""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_session.execute.return_value = mock_result

        result = await tracker.get_matches_for_tenant(tenant_id="tenant-1")

        assert result == []


class TestGetUnresolvedMatches:
    """Test get_unresolved_matches method."""

    @pytest.fixture
    def mock_session(self):
        """Create mock session."""
        return AsyncMock()

    @pytest.fixture
    def tracker(self, mock_session):
        """Create tracker with mock session."""
        return MatchTracker(session=mock_session)

    @pytest.mark.asyncio
    async def test_get_unresolved_all_tenants(self, tracker, mock_session):
        """Test getting all unresolved matches across tenants."""
        match1 = MagicMock(spec=WhitelistBlacklistMatch)
        match2 = MagicMock(spec=WhitelistBlacklistMatch)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [match1, match2]
        mock_session.execute.return_value = mock_result

        result = await tracker.get_unresolved_matches()

        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_get_unresolved_specific_tenant(self, tracker, mock_session):
        """Test getting unresolved matches for specific tenant."""
        match = MagicMock(spec=WhitelistBlacklistMatch)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [match]
        mock_session.execute.return_value = mock_result

        result = await tracker.get_unresolved_matches(tenant_id="tenant-1")

        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_get_unresolved_with_limit(self, tracker, mock_session):
        """Test getting unresolved matches with limit."""
        matches = [MagicMock(spec=WhitelistBlacklistMatch) for _ in range(10)]

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = matches
        mock_session.execute.return_value = mock_result

        result = await tracker.get_unresolved_matches(limit=10)

        assert len(result) == 10


class TestResolveMatch:
    """Test resolve_match method."""

    @pytest.fixture
    def mock_session(self):
        """Create mock session."""
        return AsyncMock()

    @pytest.fixture
    def tracker(self, mock_session):
        """Create tracker with mock session."""
        return MatchTracker(session=mock_session)

    @pytest.mark.asyncio
    async def test_resolve_existing_match(self, tracker, mock_session):
        """Test resolving an existing match."""
        match = MagicMock(spec=WhitelistBlacklistMatch)
        match.match_id = "match-1"
        match.resolution_status = "PENDING"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = match
        mock_session.execute.return_value = mock_result

        result = await tracker.resolve_match(
            match_id="match-1",
            resolution_status="FALSE_POSITIVE",
        )

        assert match.resolution_status == "FALSE_POSITIVE"
        assert match.resolved_at is not None
        mock_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_resolve_nonexistent_match(self, tracker, mock_session):
        """Test resolving a match that doesn't exist."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        result = await tracker.resolve_match(
            match_id="nonexistent",
            resolution_status="FALSE_POSITIVE",
        )

        assert result is None
        mock_session.commit.assert_not_called()

    @pytest.mark.asyncio
    async def test_resolve_with_tenant_authorization(self, tracker, mock_session):
        """Test resolving match with tenant authorization check."""
        match = MagicMock(spec=WhitelistBlacklistMatch)
        match.match_id = "match-1"
        match.tenant_id = "tenant-1"
        match.resolution_status = "PENDING"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = match
        mock_session.execute.return_value = mock_result

        result = await tracker.resolve_match(
            match_id="match-1",
            resolution_status="TRUE_POSITIVE",
            tenant_id="tenant-1",
        )

        assert match.resolution_status == "TRUE_POSITIVE"

    @pytest.mark.asyncio
    async def test_resolve_with_wrong_tenant(self, tracker, mock_session):
        """Test that wrong tenant cannot resolve match."""
        # If tenant_id filter doesn't match, scalar_one_or_none returns None
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        result = await tracker.resolve_match(
            match_id="match-1",
            resolution_status="FALSE_POSITIVE",
            tenant_id="wrong-tenant",
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_resolve_sets_resolved_at_timestamp(self, tracker, mock_session):
        """Test that resolved_at timestamp is set."""
        match = MagicMock(spec=WhitelistBlacklistMatch)
        match.match_id = "match-1"
        match.resolution_status = "PENDING"
        match.resolved_at = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = match
        mock_session.execute.return_value = mock_result

        before_resolve = datetime.now(UTC)
        await tracker.resolve_match(
            match_id="match-1",
            resolution_status="RESOLVED",
        )
        after_resolve = datetime.now(UTC)

        assert match.resolved_at is not None
        # The resolved_at should be set to a datetime
        # In our mock, it's set directly, so we just verify it was set


class TestResolutionStatuses:
    """Test various resolution statuses."""

    @pytest.fixture
    def mock_session(self):
        """Create mock session."""
        return AsyncMock()

    @pytest.fixture
    def tracker(self, mock_session):
        """Create tracker with mock session."""
        return MatchTracker(session=mock_session)

    @pytest.mark.asyncio
    async def test_resolve_as_false_positive(self, tracker, mock_session):
        """Test resolving match as false positive."""
        match = MagicMock(spec=WhitelistBlacklistMatch)
        match.resolution_status = "PENDING"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = match
        mock_session.execute.return_value = mock_result

        await tracker.resolve_match(
            match_id="match-1",
            resolution_status="FALSE_POSITIVE",
        )

        assert match.resolution_status == "FALSE_POSITIVE"

    @pytest.mark.asyncio
    async def test_resolve_as_true_positive(self, tracker, mock_session):
        """Test resolving match as true positive."""
        match = MagicMock(spec=WhitelistBlacklistMatch)
        match.resolution_status = "PENDING"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = match
        mock_session.execute.return_value = mock_result

        await tracker.resolve_match(
            match_id="match-1",
            resolution_status="TRUE_POSITIVE",
        )

        assert match.resolution_status == "TRUE_POSITIVE"

    @pytest.mark.asyncio
    async def test_resolve_as_resolved(self, tracker, mock_session):
        """Test resolving match as resolved."""
        match = MagicMock(spec=WhitelistBlacklistMatch)
        match.resolution_status = "PENDING"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = match
        mock_session.execute.return_value = mock_result

        await tracker.resolve_match(
            match_id="match-1",
            resolution_status="RESOLVED",
        )

        assert match.resolution_status == "RESOLVED"
