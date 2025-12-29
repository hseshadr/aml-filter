"""Service for tracking matches between whitelist and blacklist entities."""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import WhitelistBlacklistMatch


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
        metadata: dict[str, Any] | None = None,
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

        Returns:
            Created match record
        """
        # Check if match already exists
        existing = await self.get_match(
            tenant_id=tenant_id,
            whitelist_entity_id=whitelist_entity_id,
            blacklist_entity_id=blacklist_entity_id,
        )

        if existing:
            # Update existing match
            existing.match_score = match_score
            existing.detected_at = datetime.now(UTC)
            existing.resolution_status = "PENDING"  # Reset if previously resolved
            if metadata:
                existing.metadata_json.update(metadata)
            await self.session.commit()
            await self.session.refresh(existing)
            return existing

        # Create new match
        match = WhitelistBlacklistMatch(
            match_id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            whitelist_entity_id=whitelist_entity_id,
            blacklist_entity_id=blacklist_entity_id,
            match_score=match_score,
            match_type=match_type,
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

        query = query.order_by(WhitelistBlacklistMatch.detected_at.desc()).limit(limit).offset(offset)

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
    ) -> WhitelistBlacklistMatch | None:
        """
        Resolve a match.

        Args:
            match_id: Match ID
            resolution_status: Resolution status ('FALSE_POSITIVE', 'TRUE_POSITIVE', 'RESOLVED')
            tenant_id: Optional tenant ID for authorization check

        Returns:
            Updated match record if found, None otherwise
        """
        query = select(WhitelistBlacklistMatch).where(WhitelistBlacklistMatch.match_id == match_id)

        if tenant_id:
            query = query.where(WhitelistBlacklistMatch.tenant_id == tenant_id)

        result = await self.session.execute(query)
        match = result.scalar_one_or_none()

        if match:
            match.resolution_status = resolution_status
            match.resolved_at = datetime.now(UTC)
            await self.session.commit()
            await self.session.refresh(match)

        return match

