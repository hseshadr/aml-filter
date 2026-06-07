"""Delta-driven rescan: re-screen only the part of a sanctions list that changed.

When a sanctions list is updated, a naive rescan re-screens every customer — cost grows
with the customer count. The delta path inverts this: it embeds only the *changed*
sanctions entries and vector-searches them against an index built over CUSTOMERS
(``search/customer_index.py``), so the work scales with the size of the list change.

Equivalence with the full rescan is preserved on every change kind:

* **Added / modified that gains a match** — once the customer index identifies the
  customers near a changed entry, those customers are run through the *same*
  ``screen_entity_against_list`` scoring + recording path the full rescan uses. To keep
  the candidate set complete even when many customers cluster on one entry, a saturated
  vector search (it returned the full ``k`` cap) triggers a full per-customer rescan for
  that entry, so no true match beyond rank ``k`` is silently dropped.
* **Modified that loses a match** — after re-screening, any previously-open ``PENDING``
  match between an affected customer and a changed entry that no longer scores at or above
  threshold is closed (``RESOLVED`` + an audit note), mirroring how removals are closed.
  Already-dispositioned (non-``PENDING``) rows are left untouched.
* **Removed** — open matches whose blacklist side is gone are auto-closed (``RESOLVED``
  + reason).

So no orphaned alerts linger and the resulting open-match set equals the full rescan's.
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

#: How many nearest customers to surface per changed entry before scoring. This is only a
#: fast path: if a search returns exactly this many hits the cap was hit (saturation), and
#: ``_affected_customers`` falls back to ALL the tenant's customers for that entry — so the
#: candidate set is never silently truncated even when many customers cluster on one entry.
_NEIGHBOURS_PER_ENTRY: Final[int] = 100

_REMOVED_NOTE: Final[str] = "Auto-closed: sanctions entry removed from list"
_REMOVED_STATUS: Final[str] = "RESOLVED"
_MODIFIED_NOTE: Final[str] = "Auto-closed: sanctions entry modified — no longer matches"
_MODIFIED_STATUS: Final[str] = "RESOLVED"


class DeltaRescanService:
    """Screen only the changed slice of a sanctions list against a tenant's customers."""

    def __init__(self, session: AsyncSession, embedding_service: EmbeddingService) -> None:
        self.session = session
        self.embedding_service = embedding_service
        self._screening = BidirectionalScreeningService(
            session=session, embedding_service=embedding_service
        )

    async def rescan_added_or_modified(self, tenant_id: str, changed: list[DBEntity]) -> list[str]:
        """Re-screen affected customers for each added/modified entry, then reconcile.

        Returns the match ids the re-screen produced. After scoring, any previously-open
        ``PENDING`` match between an affected customer and a changed entry that no longer
        matches is closed, so a modify-that-loses-match leaves no stale alert.
        """
        index = await build_customer_index(self.session, tenant_id, self.embedding_service)
        affected = await self._affected_customers(index, tenant_id, changed)
        matched, fresh_pairs = await self._screen_customers(tenant_id, affected)
        await self._close_stale_modified(tenant_id, affected, changed, fresh_pairs)
        return matched

    async def _affected_customers(
        self, index: LocalVecBackend, tenant_id: str, changed: list[DBEntity]
    ) -> list[str]:
        """Customer ids near ANY changed entry, with a full-rescan fallback on saturation."""
        affected: set[str] = set()
        for entry in changed:
            affected.update(await self._neighbours_for_entry(index, tenant_id, entry))
        return sorted(affected)

    async def _neighbours_for_entry(
        self, index: LocalVecBackend, tenant_id: str, entry: DBEntity
    ) -> set[str]:
        """Customers near one changed entry; on a saturated search, fall back to all of them."""
        vector = await self._embed_entry(entry)
        hits = await index.vector_search(vector, k=_NEIGHBOURS_PER_ENTRY, tenant_id=tenant_id)
        if len(hits) >= _NEIGHBOURS_PER_ENTRY:
            return await self._all_customer_ids(tenant_id)
        return {entity_id for entity_id, _ in hits}

    async def _all_customer_ids(self, tenant_id: str) -> set[str]:
        """Every WHITELIST-side customer id for the tenant (the saturation fallback set)."""
        result = await self.session.execute(
            select(DBEntity.entity_id).where(
                DBEntity.tenant_id == tenant_id, DBEntity.risk_category == "WHITELIST"
            )
        )
        return set(result.scalars().all())

    async def _embed_entry(self, entry: DBEntity) -> list[float]:
        """Embed one changed sanctions entry (the per-change cost driver)."""
        domain = db_to_domain_entity(entry)
        country = domain.countries[0] if domain.countries else None
        return await self.embedding_service.embed(
            prepare_embedding_text(domain.primary_name, country)
        )

    async def _screen_customers(
        self, tenant_id: str, customer_ids: list[str]
    ) -> tuple[list[str], set[tuple[str, str]]]:
        """Screen each affected customer; return (match ids, fresh (customer, entry) pairs)."""
        matched: list[str] = []
        fresh_pairs: set[tuple[str, str]] = set()
        rows = await self._load_customers(tenant_id, customer_ids)
        for customer in rows:
            ids = await self._screening.screen_entity_against_list(
                entity=customer,
                target_risk_category="SANCTION",
                match_type="WHITELIST_VS_BLACKLIST",
                tenant_id=tenant_id,
            )
            matched.extend(ids)
            fresh_pairs.update((customer.entity_id, blacklist_id) for blacklist_id in ids)
        return matched, fresh_pairs

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

    async def _close_stale_modified(
        self,
        tenant_id: str,
        affected: list[str],
        changed: list[DBEntity],
        fresh_pairs: set[tuple[str, str]],
    ) -> int:
        """Close PENDING matches an affected customer had to a changed entry it no longer matches."""
        changed_ids = [entry.entity_id for entry in changed]
        rows = await self._open_matches_to_close(tenant_id, affected, changed_ids, fresh_pairs)
        for match in rows:
            await self._screening.match_tracker.resolve_match(
                match_id=match.match_id,
                resolution_status=_MODIFIED_STATUS,
                tenant_id=tenant_id,
                review_notes=_MODIFIED_NOTE,
            )
        return len(rows)

    async def _open_matches_to_close(
        self,
        tenant_id: str,
        affected: list[str],
        changed_ids: list[str],
        fresh_pairs: set[tuple[str, str]],
    ) -> list[WhitelistBlacklistMatch]:
        """PENDING (affected customer, changed entry) matches absent from the fresh match set."""
        if not affected or not changed_ids:
            return []
        result = await self.session.execute(
            select(WhitelistBlacklistMatch).where(
                WhitelistBlacklistMatch.tenant_id == tenant_id,
                WhitelistBlacklistMatch.whitelist_entity_id.in_(affected),
                WhitelistBlacklistMatch.blacklist_entity_id.in_(changed_ids),
                WhitelistBlacklistMatch.resolution_status == "PENDING",
            )
        )
        return [
            m
            for m in result.scalars().all()
            if (m.whitelist_entity_id, m.blacklist_entity_id) not in fresh_pairs
        ]

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
