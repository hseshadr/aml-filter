"""Bidirectional screening service for whitelist vs blacklist matching."""

from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.mapping import db_to_domain_entity
from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import Tenant
from aml_filter.domain.entity import Entity
from aml_filter.domain.normalization import prepare_embedding_text
from aml_filter.domain.search import CandidateScores, SearchCandidate, SearchFilters
from aml_filter.embedding.service import EmbeddingService
from aml_filter.scoring.policy import DefaultScoringPolicy, create_preset_policy
from aml_filter.screening.match_tracker import MatchTracker
from aml_filter.search.hybrid_search import HybridSearchService
from aml_filter.search.service import SearchService

RiskCategory = Literal["SANCTION", "PEP", "CUSTOM", "WHITELIST"]


def _safe_risk_category(val: str | None) -> RiskCategory:
    """Convert string to RiskCategory Literal, defaulting to SANCTION."""
    if val and val.upper() in ("SANCTION", "PEP", "CUSTOM", "WHITELIST"):
        return val.upper()  # type: ignore[return-value]
    return "SANCTION"


class BidirectionalScreeningService:
    """Service for bidirectional screening between whitelist and blacklist."""

    def __init__(
        self,
        session: AsyncSession,
        search_service: SearchService | None = None,
        match_tracker: MatchTracker | None = None,
        embedding_service: EmbeddingService | None = None,
    ):
        """
        Initialize bidirectional screening service.

        Args:
            session: Database session
            search_service: Optional search service (creates default if None)
            match_tracker: Optional match tracker (creates default if None)
            embedding_service: Optional embedding service (creates default if None)
        """
        self.session = session
        self.search_service = search_service or SearchService(session=session)
        self.match_tracker = match_tracker or MatchTracker(session=session)
        self.embedding_service = embedding_service or EmbeddingService()

    async def screen_whitelist_against_blacklist(
        self,
        tenant_id: str,
        list_id: str | None = None,
        list_version: str | None = None,
        threshold: float = 0.65,
        batch_size: int = 100,
    ) -> dict[str, int]:
        """
        Screen all whitelist customers against blacklist entities.

        Args:
            tenant_id: Tenant ID
            list_id: Optional specific list ID to screen against
            list_version: Optional specific list version
            threshold: Match threshold (default: 0.65)
            batch_size: Batch size for processing

        Returns:
            Dictionary with statistics: {'entities_scanned': int, 'matches_found': int}
        """
        # Get all whitelist customers for tenant
        query = select(DBEntity).where(
            DBEntity.tenant_id == tenant_id,
            DBEntity.risk_category == "WHITELIST",
        )
        result = await self.session.execute(query)
        whitelist_entities = list(result.scalars().all())

        entities_scanned = 0
        matches_found = 0

        # Process in batches
        for i in range(0, len(whitelist_entities), batch_size):
            batch = whitelist_entities[i : i + batch_size]

            for whitelist_entity in batch:
                # Screen this whitelist entity against blacklist
                matches = await self.screen_entity_against_list(
                    entity=whitelist_entity,
                    target_risk_category="SANCTION",  # Screen against sanctions
                    list_id=list_id,
                    list_version=list_version,
                    threshold=threshold,
                    match_type="WHITELIST_VS_BLACKLIST",
                    tenant_id=tenant_id,
                )

                entities_scanned += 1
                matches_found += len(matches)

        return {
            "entities_scanned": entities_scanned,
            "matches_found": matches_found,
        }

    async def screen_blacklist_against_whitelist(
        self,
        list_id: str | None = None,
        list_version: str | None = None,
        threshold: float = 0.65,
        batch_size: int = 100,
    ) -> dict[str, int]:
        """
        Screen new blacklist entries against all tenant whitelists.

        Args:
            list_id: Optional specific list ID to screen
            list_version: Optional specific list version
            threshold: Match threshold (default: 0.65)
            batch_size: Batch size for processing

        Returns:
            Dictionary with statistics: {'entities_scanned': int, 'matches_found': int}
        """
        blacklist_entities = await self._load_blacklist_entities(list_id, list_version)
        tenants_result = await self.session.execute(select(Tenant))
        tenants = list(tenants_result.scalars().all())

        entities_scanned = 0
        matches_found = 0
        for i in range(0, len(blacklist_entities), batch_size):
            for blacklist_entity in blacklist_entities[i : i + batch_size]:
                for tenant in tenants:
                    matches = await self.screen_entity_against_list(
                        entity=blacklist_entity,
                        target_risk_category="WHITELIST",
                        threshold=threshold,
                        match_type="BLACKLIST_VS_WHITELIST",
                        tenant_id=tenant.tenant_id,
                    )
                    entities_scanned += 1
                    matches_found += len(matches)

        return {"entities_scanned": entities_scanned, "matches_found": matches_found}

    async def _load_blacklist_entities(
        self, list_id: str | None, list_version: str | None
    ) -> list[DBEntity]:
        """Load global blacklist entities, optionally narrowed by source list/version."""
        query = select(DBEntity).where(
            DBEntity.tenant_id.is_(None),
            DBEntity.risk_category.in_(["SANCTION", "PEP", "CUSTOM"]),
        )
        if list_id:
            query = query.where(DBEntity.source_list == list_id)
        if list_version:
            query = query.where(DBEntity.list_version == list_version)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def screen_entity_against_list(
        self,
        entity: DBEntity,
        target_risk_category: str,
        list_id: str | None = None,
        list_version: str | None = None,
        threshold: float = 0.65,
        match_type: str = "WHITELIST_VS_BLACKLIST",
        tenant_id: str | None = None,
    ) -> list[str]:
        """Screen one entity against entities of the opposite risk category. Returns match IDs."""
        domain_entity = self._db_to_domain_entity(entity)
        search_tenant_id = self._resolve_search_tenant_id(target_risk_category, tenant_id)
        if target_risk_category == "WHITELIST" and search_tenant_id is None:
            return []

        candidates = await self._search_candidates_for(
            domain_entity, target_risk_category, list_id, search_tenant_id
        )
        scored = await self._score_candidates_against(domain_entity, candidates, threshold)
        return await self._record_qualifying_matches(
            scored, entity, target_risk_category, list_id, list_version, match_type, tenant_id
        )

    @staticmethod
    def _resolve_search_tenant_id(target_risk_category: str, tenant_id: str | None) -> str | None:
        """Pick the search-scope tenant — None for global blacklists, tenant_id for whitelists."""
        return tenant_id if target_risk_category == "WHITELIST" else None

    async def _search_candidates_for(
        self,
        domain_entity: Entity,
        target_risk_category: str,
        list_id: str | None,
        search_tenant_id: str | None,
    ) -> list[SearchCandidate]:
        """Embed the entity and hybrid-search for opposite-side candidates."""
        query_vector = await self.embedding_service.embed(
            prepare_embedding_text(
                domain_entity.primary_name,
                domain_entity.countries[0] if domain_entity.countries else None,
            )
        )
        filters = SearchFilters(
            source_lists=[list_id] if list_id else None,
            risk_categories=[_safe_risk_category(target_risk_category)],
            entity_types=[domain_entity.entity_type] if domain_entity.entity_type else None,
        )
        hybrid_search = HybridSearchService(session=self.session)
        return await hybrid_search.search(
            query_vector=query_vector,
            query_text=domain_entity.name_canonical,
            k=20,
            tenant_id=search_tenant_id,
            filters=filters,
        )

    async def _score_candidates_against(
        self,
        domain_entity: Entity,
        candidates: list[SearchCandidate],
        threshold: float,
    ) -> list[tuple[float, str, DBEntity]]:
        """Score each candidate against the source entity; keep matches above threshold, sorted desc."""
        entity_ids = [eid for eid, _, _ in candidates]
        if not entity_ids:
            return []
        entity_map = await self._load_entity_map(entity_ids)
        scorer = DefaultScoringPolicy(
            create_preset_policy("balanced", "bidirectional", "bidirectional")
        )
        scored = [
            row
            for entity_id, _max_score, scores in candidates
            if (
                row := self._score_one_candidate(
                    domain_entity, entity_id, scores, entity_map, scorer, threshold
                )
            )
            is not None
        ]
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored

    async def _load_entity_map(self, entity_ids: list[str]) -> dict[str, DBEntity]:
        """Fetch DB entities for the given ids, keyed by entity_id."""
        result = await self.session.execute(
            select(DBEntity).where(DBEntity.entity_id.in_(entity_ids))
        )
        return {e.entity_id: e for e in result.scalars().all()}

    def _score_one_candidate(
        self,
        domain_entity: Entity,
        entity_id: str,
        scores: CandidateScores,
        entity_map: dict[str, DBEntity],
        scorer: DefaultScoringPolicy,
        threshold: float,
    ) -> tuple[float, str, DBEntity] | None:
        """Score a single candidate; return (score, id, row) if above threshold, else None."""
        db_entity = entity_map.get(entity_id)
        if db_entity is None:
            return None
        score, _ = scorer.compute_score(
            entity=self._db_to_domain_entity(db_entity),
            query_name=domain_entity.primary_name,
            query_name_canonical=domain_entity.name_canonical,
            query_dob=domain_entity.dob[0] if domain_entity.dob else None,
            query_country=domain_entity.countries[0] if domain_entity.countries else None,
            query_entity_type=domain_entity.entity_type,
            vector_similarity=scores.vector_score,
            trigram_similarity=scores.lexical_score,
        )
        return (score, entity_id, db_entity) if score >= threshold else None

    async def _record_qualifying_matches(
        self,
        scored: list[tuple[float, str, DBEntity]],
        source_entity: DBEntity,
        target_risk_category: str,
        list_id: str | None,
        list_version: str | None,
        match_type: str,
        tenant_id: str | None,
    ) -> list[str]:
        """Filter scored matches by category/list/version, persist each, return their IDs."""
        matched_ids: list[str] = []
        for score, entity_id, db_entity in scored:
            if not self._match_qualifies(db_entity, target_risk_category, list_id, list_version):
                continue
            await self._record_match(
                target_risk_category,
                source_entity,
                db_entity,
                entity_id,
                score,
                match_type,
                list_version,
                tenant_id,
            )
            matched_ids.append(entity_id)
        return matched_ids

    @staticmethod
    def _match_qualifies(
        db_entity: DBEntity,
        target_risk_category: str,
        list_id: str | None,
        list_version: str | None,
    ) -> bool:
        """True iff this candidate's category, source_list, and list_version match the filters."""
        category_ok = db_entity.risk_category == target_risk_category
        list_ok = not list_id or db_entity.source_list == list_id
        version_ok = not list_version or db_entity.list_version == list_version
        return category_ok and list_ok and version_ok

    async def _record_match(
        self,
        target_risk_category: str,
        source_entity: DBEntity,
        match_db_entity: DBEntity,
        match_entity_id: str,
        score: float,
        match_type: str,
        list_version: str | None,
        tenant_id: str | None,
    ) -> None:
        """Persist a single match via the match tracker (orientation depends on target side)."""
        if target_risk_category == "WHITELIST":
            whitelist_id, blacklist_id = match_entity_id, source_entity.entity_id
        else:
            whitelist_id, blacklist_id = source_entity.entity_id, match_entity_id
        await self.match_tracker.record_match(
            tenant_id=tenant_id or "",
            whitelist_entity_id=whitelist_id,
            blacklist_entity_id=blacklist_id,
            match_score=score,
            match_type=match_type,
            list_version=list_version or match_db_entity.list_version,
        )

    def _db_to_domain_entity(self, db_entity: DBEntity) -> Entity:
        """Convert a database entity to a validated domain entity."""
        return db_to_domain_entity(db_entity)
