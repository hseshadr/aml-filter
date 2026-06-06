"""Delta-driven rescan: re-screen only the part of a sanctions list that changed.

When a sanctions list is updated, a naive rescan re-screens every customer — cost grows
with the customer count. The delta path inverts this: it embeds only the *changed*
sanctions entries and vector-searches them against an index built over CUSTOMERS
(``search/customer_index.py``), so the work scales with the size of the list change.

Equivalence with the full rescan is preserved by reusing the unchanged
:class:`~aml_filter.screening.bidirectional.BidirectionalScreeningService`: once the
customer index identifies the customers near a changed entry, those customers are run
through the *same* ``screen_entity_against_list`` scoring + recording path the full
rescan uses. Removed entries auto-close their open matches (a clear ``RESOLVED`` status
annotated with the reason), so no orphaned alerts linger.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.mapping import db_to_domain_entity
from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import WhitelistBlacklistMatch
from aml_filter.domain.normalization import prepare_embedding_text
from aml_filter.embedding import EmbeddingService
from aml_filter.screening.bidirectional import BidirectionalScreeningService
from aml_filter.search.customer_index import build_customer_index
from aml_filter.search.localvec_backend import LocalVecBackend

#: How many nearest customers to surface per changed entry before scoring (over-fetch so
#: every customer the full rescan would match against the entry is in the candidate set).
_NEIGHBOURS_PER_ENTRY: Final[int] = 100

_REMOVED_NOTE: Final[str] = "Auto-closed: sanctions entry removed from list"
_REMOVED_STATUS: Final[str] = "RESOLVED"


class DeltaRescanService:
    """Screen only the changed slice of a sanctions list against a tenant's customers."""

    def __init__(self, session: AsyncSession, embedding_service: EmbeddingService) -> None:
        self.session = session
        self.embedding_service = embedding_service
        self._screening = BidirectionalScreeningService(
            session=session, embedding_service=embedding_service
        )

    async def rescan_added_or_modified(self, tenant_id: str, changed: list[DBEntity]) -> list[str]:
        """Re-screen the affected customers for each added/modified sanctions entry."""
        index = await build_customer_index(self.session, tenant_id, self.embedding_service)
        affected = await self._affected_customers(index, tenant_id, changed)
        return await self._screen_customers(tenant_id, affected)

    async def _affected_customers(
        self, index: LocalVecBackend, tenant_id: str, changed: list[DBEntity]
    ) -> list[str]:
        """Customer ids near ANY changed entry (one vector search per changed entry)."""
        affected: set[str] = set()
        for entry in changed:
            vector = await self._embed_entry(entry)
            hits = await index.vector_search(vector, k=_NEIGHBOURS_PER_ENTRY, tenant_id=tenant_id)
            affected.update(entity_id for entity_id, _ in hits)
        return sorted(affected)

    async def _embed_entry(self, entry: DBEntity) -> list[float]:
        """Embed one changed sanctions entry (the per-change cost driver)."""
        domain = db_to_domain_entity(entry)
        country = domain.countries[0] if domain.countries else None
        return await self.embedding_service.embed(
            prepare_embedding_text(domain.primary_name, country)
        )

    async def _screen_customers(self, tenant_id: str, customer_ids: list[str]) -> list[str]:
        """Run the unchanged per-customer screening path for each affected customer."""
        matched: list[str] = []
        rows = await self._load_customers(tenant_id, customer_ids)
        for customer in rows:
            ids = await self._screening.screen_entity_against_list(
                entity=customer,
                target_risk_category="SANCTION",
                match_type="WHITELIST_VS_BLACKLIST",
                tenant_id=tenant_id,
            )
            matched.extend(ids)
        return matched

    async def _load_customers(self, tenant_id: str, customer_ids: list[str]) -> list[DBEntity]:
        """Load the affected customer entity rows for the tenant."""
        if not customer_ids:
            return []
        result = await self.session.execute(
            select(DBEntity).where(
                DBEntity.tenant_id == tenant_id, DBEntity.entity_id.in_(customer_ids)
            )
        )
        return list(result.scalars().all())

    async def close_removed(self, tenant_id: str, removed_ids: list[str]) -> int:
        """Auto-close open matches that referenced a now-removed sanctions entry."""
        if not removed_ids:
            return 0
        rows = await self._open_matches_for_removed(tenant_id, removed_ids)
        for match in rows:
            self._mark_removed(match)
        await self.session.commit()
        return len(rows)

    async def _open_matches_for_removed(
        self, tenant_id: str, removed_ids: list[str]
    ) -> list[WhitelistBlacklistMatch]:
        """Open (PENDING) matches whose blacklist side is one of the removed entries."""
        result = await self.session.execute(
            select(WhitelistBlacklistMatch).where(
                WhitelistBlacklistMatch.tenant_id == tenant_id,
                WhitelistBlacklistMatch.blacklist_entity_id.in_(removed_ids),
                WhitelistBlacklistMatch.resolution_status == "PENDING",
            )
        )
        return list(result.scalars().all())

    @staticmethod
    def _mark_removed(match: WhitelistBlacklistMatch) -> None:
        """Annotate one match as resolved because its sanctions entry was removed."""
        match.resolution_status = _REMOVED_STATUS
        match.resolved_at = datetime.now(UTC)
        match.review_notes = _REMOVED_NOTE
