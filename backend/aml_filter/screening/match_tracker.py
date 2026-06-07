"""Service for tracking matches between whitelist and blacklist entities."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import WhitelistBlacklistMatch
from aml_filter.scoring.config import get_scoring_defaults
from aml_filter.scoring.tiers import get_tier_bands
from aml_filter.types import JsonObject


def _classify(match_score: float, possible_threshold: float | None) -> str:
    """Classify a final score into its review tier value (STRONG/POSSIBLE/WEAK).

    Note: ``match_tier`` is point-in-time — it is classified once at record time and
    persisted on the row. Later changes to the tier bands (e.g. a new ``TIER_STRONG``)
    do NOT re-tier existing match rows; only a re-score of the pair updates the tier.
    """
    threshold = (
        possible_threshold
        if possible_threshold is not None
        else get_scoring_defaults().default_threshold
    )
    return get_tier_bands().classify(match_score, possible_threshold=threshold).value


class MatchTracker:
    """Service for storing and querying whitelist-blacklist matches."""

    def __init__(self, session: AsyncSession):
        """
        Initialize match tracker.

        Args:
            session: Database session
        """
        self.session = session

    async def record_match(
        self,
        tenant_id: str,
        whitelist_entity_id: str,
        blacklist_entity_id: str,
        match_score: float,
        match_type: str,
        list_version: str | None = None,
        metadata: JsonObject | None = None,
        possible_threshold: float | None = None,
    ) -> WhitelistBlacklistMatch:
        """
        Record a match between whitelist and blacklist entities.

        Args:
            tenant_id: Tenant ID
            whitelist_entity_id: Whitelist entity ID
            blacklist_entity_id: Blacklist entity ID
            match_score: Match score (0.0-1.0)
            match_type: 'WHITELIST_VS_BLACKLIST' or 'BLACKLIST_VS_WHITELIST'
            list_version: Optional list version
            metadata: Optional metadata dictionary
            possible_threshold: Policy threshold for the POSSIBLE tier band

        Returns:
            Created match record
        """
        tier = _classify(match_score, possible_threshold)
        existing = await self.get_match(
            tenant_id=tenant_id,
            whitelist_entity_id=whitelist_entity_id,
            blacklist_entity_id=blacklist_entity_id,
        )
        if existing:
            return await self._update_match(existing, match_score, tier, metadata)
        return await self._create_match(
            tenant_id,
            whitelist_entity_id,
            blacklist_entity_id,
            match_score,
            match_type,
            list_version,
            metadata,
            tier,
        )

    async def _update_match(
        self,
        existing: WhitelistBlacklistMatch,
        match_score: float,
        tier: str,
        metadata: JsonObject | None,
    ) -> WhitelistBlacklistMatch:
        """Refresh an existing match's score, tier, and status (resets resolution)."""
        existing.match_score = match_score
        existing.match_tier = tier
        existing.detected_at = datetime.now(UTC)
        existing.resolution_status = "PENDING"  # Reset if previously resolved
        if metadata:
            existing.metadata_json.update(metadata)
        await self.session.commit()
        await self.session.refresh(existing)
        return existing

    async def _create_match(
        self,
        tenant_id: str,
        whitelist_entity_id: str,
        blacklist_entity_id: str,
        match_score: float,
        match_type: str,
        list_version: str | None,
        metadata: JsonObject | None,
        tier: str,
    ) -> WhitelistBlacklistMatch:
        """Persist a brand-new match row."""
        match = WhitelistBlacklistMatch(
            match_id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            whitelist_entity_id=whitelist_entity_id,
            blacklist_entity_id=blacklist_entity_id,
            match_score=match_score,
            match_type=match_type,
            match_tier=tier,
            list_version=list_version,
            resolution_status="PENDING",
            metadata_json=metadata or {},
        )
        self.session.add(match)
        await self.session.commit()
        await self.session.refresh(match)
        return match

    async def get_match(
        self,
        tenant_id: str,
        whitelist_entity_id: str,
        blacklist_entity_id: str,
    ) -> WhitelistBlacklistMatch | None:
        """
        Get a specific match if it exists.

        Args:
            tenant_id: Tenant ID
            whitelist_entity_id: Whitelist entity ID
            blacklist_entity_id: Blacklist entity ID

        Returns:
            Match record if found, None otherwise
        """
        result = await self.session.execute(
            select(WhitelistBlacklistMatch).where(
                WhitelistBlacklistMatch.tenant_id == tenant_id,
                WhitelistBlacklistMatch.whitelist_entity_id == whitelist_entity_id,
                WhitelistBlacklistMatch.blacklist_entity_id == blacklist_entity_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_matches_for_tenant(
        self,
        tenant_id: str,
        resolution_status: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[WhitelistBlacklistMatch]:
        """
        Get matches for a tenant.

        Args:
            tenant_id: Tenant ID
            resolution_status: Optional filter by resolution status
            limit: Maximum number of results
            offset: Offset for pagination

        Returns:
            List of match records
        """
        query = select(WhitelistBlacklistMatch).where(
            WhitelistBlacklistMatch.tenant_id == tenant_id
        )

        if resolution_status:
            query = query.where(WhitelistBlacklistMatch.resolution_status == resolution_status)

        query = (
            query.order_by(WhitelistBlacklistMatch.detected_at.desc()).limit(limit).offset(offset)
        )

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_unresolved_matches(
        self,
        tenant_id: str | None = None,
        limit: int = 100,
    ) -> list[WhitelistBlacklistMatch]:
        """
        Get unresolved matches.

        Args:
            tenant_id: Optional tenant ID filter
            limit: Maximum number of results

        Returns:
            List of unresolved match records
        """
        query = select(WhitelistBlacklistMatch).where(
            WhitelistBlacklistMatch.resolution_status == "PENDING"
        )

        if tenant_id:
            query = query.where(WhitelistBlacklistMatch.tenant_id == tenant_id)

        query = query.order_by(WhitelistBlacklistMatch.detected_at.desc()).limit(limit)

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def resolve_match(
        self,
        match_id: str,
        resolution_status: str,
        tenant_id: str | None = None,
        reviewer_id: str | None = None,
        review_notes: str | None = None,
    ) -> WhitelistBlacklistMatch | None:
        """
        Resolve a match, recording who reviewed it and any notes.

        Args:
            match_id: Match ID
            resolution_status: Resolution status ('FALSE_POSITIVE', 'TRUE_POSITIVE', 'RESOLVED')
            tenant_id: Optional tenant ID for authorization check
            reviewer_id: Optional identifier of the reviewing analyst
            review_notes: Optional free-text review notes

        Returns:
            Updated match record if found, None otherwise
        """
        query = select(WhitelistBlacklistMatch).where(WhitelistBlacklistMatch.match_id == match_id)
        if tenant_id:
            query = query.where(WhitelistBlacklistMatch.tenant_id == tenant_id)
        result = await self.session.execute(query)
        match = result.scalar_one_or_none()
        if match:
            await self._apply_resolution(match, resolution_status, reviewer_id, review_notes)
        return match

    async def _apply_resolution(
        self,
        match: WhitelistBlacklistMatch,
        resolution_status: str,
        reviewer_id: str | None,
        review_notes: str | None,
    ) -> None:
        """Set resolution fields + review metadata and persist."""
        match.resolution_status = resolution_status
        match.resolved_at = datetime.now(UTC)
        if reviewer_id is not None:
            match.reviewer_id = reviewer_id
        if review_notes is not None:
            match.review_notes = review_notes
        await self.session.commit()
        await self.session.refresh(match)
