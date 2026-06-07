"""Unit tests for tier population and review metadata in MatchTracker."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from aml_filter.db.models import WhitelistBlacklistMatch
from aml_filter.scoring.tiers import MatchTier
from aml_filter.screening.match_tracker import MatchTracker


@pytest.fixture
def mock_session():
    return AsyncMock()


@pytest.fixture
def tracker(mock_session):
    return MatchTracker(session=mock_session)


def _no_existing(mock_session):
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = result


class TestRecordMatchTier:
    """record_match populates match_tier from the score + bands."""

    @pytest.mark.asyncio
    async def test_strong_score_records_strong_tier(self, tracker, mock_session):
        _no_existing(mock_session)
        await tracker.record_match(
            tenant_id="t1",
            whitelist_entity_id="w1",
            blacklist_entity_id="b1",
            match_score=0.92,
            match_type="WHITELIST_VS_BLACKLIST",
        )
        added = mock_session.add.call_args[0][0]
        assert added.match_tier == MatchTier.STRONG.value

    @pytest.mark.asyncio
    async def test_mid_score_records_possible_tier(self, tracker, mock_session):
        _no_existing(mock_session)
        await tracker.record_match(
            tenant_id="t1",
            whitelist_entity_id="w1",
            blacklist_entity_id="b1",
            match_score=0.70,
            match_type="WHITELIST_VS_BLACKLIST",
            possible_threshold=0.65,
        )
        added = mock_session.add.call_args[0][0]
        assert added.match_tier == MatchTier.POSSIBLE.value

    @pytest.mark.asyncio
    async def test_low_score_records_weak_tier(self, tracker, mock_session):
        _no_existing(mock_session)
        await tracker.record_match(
            tenant_id="t1",
            whitelist_entity_id="w1",
            blacklist_entity_id="b1",
            match_score=0.40,
            match_type="WHITELIST_VS_BLACKLIST",
            possible_threshold=0.65,
        )
        added = mock_session.add.call_args[0][0]
        assert added.match_tier == MatchTier.WEAK.value

    @pytest.mark.asyncio
    async def test_existing_match_tier_recomputed(self, tracker, mock_session):
        existing = WhitelistBlacklistMatch(
            match_id="m1",
            tenant_id="t1",
            whitelist_entity_id="w1",
            blacklist_entity_id="b1",
            match_score=0.40,
            match_type="WHITELIST_VS_BLACKLIST",
            match_tier=MatchTier.WEAK.value,
        )
        result = MagicMock()
        result.scalar_one_or_none.return_value = existing
        mock_session.execute.return_value = result

        await tracker.record_match(
            tenant_id="t1",
            whitelist_entity_id="w1",
            blacklist_entity_id="b1",
            match_score=0.95,
            match_type="WHITELIST_VS_BLACKLIST",
        )
        assert existing.match_tier == MatchTier.STRONG.value


class TestResolveReviewMetadata:
    """resolve_match persists reviewer_id and review_notes."""

    @pytest.mark.asyncio
    async def test_resolve_persists_reviewer_and_notes(self, tracker, mock_session):
        match = WhitelistBlacklistMatch(
            match_id="m1",
            tenant_id="t1",
            whitelist_entity_id="w1",
            blacklist_entity_id="b1",
            match_score=0.9,
            match_type="WHITELIST_VS_BLACKLIST",
        )
        result = MagicMock()
        result.scalar_one_or_none.return_value = match
        mock_session.execute.return_value = result

        await tracker.resolve_match(
            match_id="m1",
            resolution_status="TRUE_POSITIVE",
            tenant_id="t1",
            reviewer_id="analyst-7",
            review_notes="Confirmed sanctioned individual.",
        )
        assert match.reviewer_id == "analyst-7"
        assert match.review_notes == "Confirmed sanctioned individual."
        assert match.resolution_status == "TRUE_POSITIVE"
