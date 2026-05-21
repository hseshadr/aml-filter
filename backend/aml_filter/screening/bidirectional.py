"""Bidirectional screening service for whitelist vs blacklist matching."""

from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import Tenant
from aml_filter.domain.entity import Alias, Entity, EntityIdentifier
from aml_filter.domain.normalization import prepare_embedding_text
from aml_filter.domain.search import SearchFilters
from aml_filter.embedding.service import EmbeddingService
from aml_filter.scoring.policy import DefaultScoringPolicy, create_preset_policy
from aml_filter.screening.match_tracker import MatchTracker
from aml_filter.search.hybrid_search import HybridSearchService
from aml_filter.search.service import SearchService

EntityType = Literal["PERSON", "ORGANIZATION"]
RiskCategory = Literal["SANCTION", "PEP", "CUSTOM", "WHITELIST"]


def _safe_entity_type(val: str | None) -> EntityType:
    """Convert string to EntityType Literal, defaulting to PERSON."""
    if val and val.upper() in ("PERSON", "ORGANIZATION"):
        return val.upper()  # type: ignore[return-value]
    return "PERSON"


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
        # Get blacklist entities
        query = select(DBEntity).where(
            DBEntity.tenant_id.is_(None),  # Global entities
            DBEntity.risk_category.in_(["SANCTION", "PEP", "CUSTOM"]),
        )

        if list_id:
            query = query.where(DBEntity.source_list == list_id)
        if list_version:
            query = query.where(DBEntity.list_version == list_version)

        result = await self.session.execute(query)
        blacklist_entities = list(result.scalars().all())

        entities_scanned = 0
        matches_found = 0

        # Get all tenants with whitelists
        tenants_query = select(Tenant)
        tenants_result = await self.session.execute(tenants_query)
        tenants = list(tenants_result.scalars().all())

        # Process in batches
        for i in range(0, len(blacklist_entities), batch_size):
            batch = blacklist_entities[i : i + batch_size]

            for blacklist_entity in batch:
                # Screen this blacklist entity against all tenant whitelists
                for tenant in tenants:
                    matches = await self.screen_entity_against_list(
                        entity=blacklist_entity,
                        target_risk_category="WHITELIST",
                        list_id=None,
                        list_version=None,
                        threshold=threshold,
                        match_type="BLACKLIST_VS_WHITELIST",
                        tenant_id=tenant.tenant_id,
                    )

                    entities_scanned += 1
                    matches_found += len(matches)

        return {
            "entities_scanned": entities_scanned,
            "matches_found": matches_found,
        }

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
        """
        Screen a single entity against entities of opposite type.

        Args:
            entity: Entity to screen
            target_risk_category: Risk category to screen against ('WHITELIST' or 'SANCTION', 'PEP', 'CUSTOM')
            list_id: Optional specific list ID
            list_version: Optional specific list version
            threshold: Match threshold
            match_type: 'WHITELIST_VS_BLACKLIST' or 'BLACKLIST_VS_WHITELIST'
            tenant_id: Tenant ID (required for whitelist screening)

        Returns:
            List of matched entity IDs
        """
        # Convert DB entity to domain entity
        domain_entity = self._db_to_domain_entity(entity)

        # Determine tenant_id and filters for search
        search_tenant_id = tenant_id

        # Create filters to target specific risk category
        safe_risk_cat = _safe_risk_category(target_risk_category)
        search_filters = SearchFilters(
            source_lists=[list_id] if list_id else None,
            risk_categories=[safe_risk_cat],  # Filter by target risk category
            entity_types=[domain_entity.entity_type] if domain_entity.entity_type else None,
        )

        if target_risk_category == "WHITELIST":
            # Screening blacklist against whitelist - need tenant_id
            if not search_tenant_id:
                return []
        else:
            # Screening whitelist against blacklist - use None for global entities
            search_tenant_id = None

        # Use hybrid search directly with filters
        # Prepare embedding text
        embedding_text = prepare_embedding_text(
            domain_entity.primary_name,
            domain_entity.countries[0] if domain_entity.countries else None,
        )
        query_vector = await self.embedding_service.embed(embedding_text)

        # Perform hybrid search with filters
        hybrid_search = HybridSearchService(session=self.session)
        search_results = await hybrid_search.search(
            query_vector=query_vector,
            query_text=domain_entity.name_canonical,
            k=20,
            tenant_id=search_tenant_id,
            filters=search_filters,
        )

        # Load entities for scoring
        entity_ids = [entity_id for entity_id, _, _ in search_results]
        if not entity_ids:
            return []

        # Load entities from database
        stmt = select(DBEntity).where(DBEntity.entity_id.in_(entity_ids))
        result = await self.session.execute(stmt)
        db_entities = result.scalars().all()

        # Create entity map
        entity_map = {e.entity_id: e for e in db_entities}

        # Score matches using search service's scoring

        scoring_policy = create_preset_policy(
            "balanced", f"default-{search_tenant_id or 'global'}", search_tenant_id or "global"
        )
        scorer = DefaultScoringPolicy(scoring_policy)

        # Score each candidate
        scored_matches = []
        for entity_id, _max_score, metadata in search_results:
            if entity_id not in entity_map:
                continue

            db_entity = entity_map[entity_id]
            domain_match_entity = self._db_to_domain_entity(db_entity)

            # Get similarities from search metadata
            vector_sim = metadata.get("vector_score")
            trigram_sim = metadata.get("lexical_score")

            # Compute score (explanation not surfaced in bidirectional results)
            score, _explanation = scorer.compute_score(
                entity=domain_match_entity,
                query_name=domain_entity.primary_name,
                query_name_canonical=domain_entity.name_canonical,
                query_dob=domain_entity.dob[0] if domain_entity.dob else None,
                query_country=domain_entity.countries[0] if domain_entity.countries else None,
                query_entity_type=domain_entity.entity_type,
                vector_similarity=vector_sim,
                trigram_similarity=trigram_sim,
            )

            # Filter by threshold
            if score >= threshold:
                scored_matches.append((score, entity_id, db_entity))

        # Sort by score (descending)
        scored_matches.sort(key=lambda x: x[0], reverse=True)

        # Record matches
        matched_entity_ids = []
        for score, entity_id, db_entity in scored_matches:
            # Check if match is of target risk category
            if db_entity.risk_category != target_risk_category:
                continue

            # Check list_id if specified
            if list_id and db_entity.source_list != list_id:
                continue

            # Check list_version if specified
            if list_version and db_entity.list_version != list_version:
                continue

            # Record match
            if target_risk_category == "WHITELIST":
                # Blacklist vs Whitelist
                await self.match_tracker.record_match(
                    tenant_id=tenant_id or "",
                    whitelist_entity_id=entity_id,
                    blacklist_entity_id=entity.entity_id,
                    match_score=score,
                    match_type=match_type,
                    list_version=list_version or db_entity.list_version,
                )
            else:
                # Whitelist vs Blacklist
                await self.match_tracker.record_match(
                    tenant_id=tenant_id or "",
                    whitelist_entity_id=entity.entity_id,
                    blacklist_entity_id=entity_id,
                    match_score=score,
                    match_type=match_type,
                    list_version=list_version or db_entity.list_version,
                )

            matched_entity_ids.append(entity_id)

        return matched_entity_ids

    def _db_to_domain_entity(self, db_entity: DBEntity) -> Entity:
        """Convert database entity to domain entity."""

        # Parse aliases from JSONB
        aliases = []
        if db_entity.aliases:
            for alias_dict in db_entity.aliases:
                aliases.append(
                    Alias(
                        name=alias_dict.get("name", ""),
                        name_canonical=alias_dict.get("name_canonical", ""),
                        source=alias_dict.get("source", ""),
                    )
                )

        # Parse identifiers
        identifiers_dict = db_entity.identifiers or {}
        identifiers = EntityIdentifier(
            passport=identifiers_dict.get("passport", []),
            national_id=identifiers_dict.get("national_id", []),
            other=identifiers_dict.get("other", {}),
        )

        return Entity(
            entity_id=db_entity.entity_id,
            tenant_id=db_entity.tenant_id,
            entity_type=_safe_entity_type(db_entity.entity_type),
            primary_name=db_entity.primary_name,
            name_canonical=db_entity.name_canonical,
            name_tokens=db_entity.name_tokens or [],
            name_trigram=db_entity.name_trigram,
            aliases=aliases,
            dob=db_entity.dob or [],
            countries=db_entity.countries or [],
            nationalities=db_entity.nationalities or [],
            addresses=db_entity.addresses or [],
            identifiers=identifiers,
            risk_category=_safe_risk_category(db_entity.risk_category),
            source_list=db_entity.source_list,
            list_version=db_entity.list_version,
            custom_list_id=db_entity.custom_list_id,
            raw_source=db_entity.raw_source or {},
        )
