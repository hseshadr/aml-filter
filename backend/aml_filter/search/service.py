"""Complete search service integrating all components."""

import hashlib
import json
import time
import uuid
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import SearchRequest
from aml_filter.domain.entity import Alias, Entity, EntityIdentifier
from aml_filter.domain.normalization import normalize_name, prepare_embedding_text
from aml_filter.domain.scoring import ScoringPolicy
from aml_filter.domain.search import Match, MatchReason, SearchFilters, SearchQuery, SearchResponse
from aml_filter.embedding.service import EmbeddingService
from aml_filter.scoring.policy import DefaultScoringPolicy
from aml_filter.search.hybrid_search import HybridSearchService

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


class SearchService:
    """Complete search service that orchestrates search, scoring, and result formatting."""

    def __init__(
        self,
        session: AsyncSession,
        embedding_service: EmbeddingService | None = None,
        hybrid_search_service: HybridSearchService | None = None,
    ) -> None:
        """
        Initialize search service.

        Args:
            session: Async SQLAlchemy session
            embedding_service: Optional embedding service (creates default if None)
            hybrid_search_service: Optional hybrid search service (creates default if None)
        """
        self.session = session
        self.embedding_service = embedding_service or EmbeddingService()
        self.hybrid_search_service = hybrid_search_service or HybridSearchService(session=session)

    def _compute_request_hash(
        self,
        query: SearchQuery,
        tenant_id: str | None,
        scoring_policy: ScoringPolicy | None,
    ) -> str:
        """Compute a stable SHA-256 hash of request inputs for audit immutability."""
        request_data: dict[str, Any] = {
            "tenant_id": tenant_id,
            "query": query.model_dump(mode="json"),
        }
        if scoring_policy is not None:
            request_data["policy"] = {
                "policy_id": scoring_policy.policy_id,
                "version": scoring_policy.version,
                "threshold": scoring_policy.threshold,
                "weights": scoring_policy.weights.model_dump(mode="json"),
            }
        encoded = json.dumps(request_data, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    async def search(
        self,
        query: SearchQuery,
        tenant_id: str | None = None,
        scoring_policy: ScoringPolicy | None = None,
        user_id: str | None = None,
    ) -> SearchResponse:
        """
        Perform complete entity search with scoring.

        Args:
            query: Search query
            tenant_id: Optional tenant ID for filtering
            scoring_policy: Optional scoring policy (uses default balanced if None)
            user_id: Optional user ID for auditing

        Returns:
            SearchResponse with matches and explanations
        """
        start_time = time.time()
        request_id = str(uuid.uuid4())
        request_hash = ""  # computed after policy resolution (includes policy if available)

        # Normalize query name
        normalized = normalize_name(query.name)
        query_name_canonical = normalized["name_canonical"]

        # Prepare embedding text
        embedding_text = prepare_embedding_text(query.name, query.country)

        # Generate query embedding
        query_vector = await self.embedding_service.embed(embedding_text)

        # Build search filters
        filters = SearchFilters(
            source_lists=query.lists,
            risk_categories=None,  # Can be added to query if needed
            entity_types=[query.entity_type] if query.entity_type else None,
        )

        # Perform hybrid search
        search_results = await self.hybrid_search_service.search(
            query_vector=query_vector,
            query_text=query_name_canonical,
            k=query.k * 2,  # Get more candidates for scoring
            tenant_id=tenant_id,
            filters=filters,
        )

        # Load entities for scoring
        entity_ids = [entity_id for entity_id, _, _ in search_results]

        # Create default search response structure
        response_matches = []
        list_versions_used: dict[str, str] = {}

        if entity_ids:
            # Load entities from database
            stmt = select(DBEntity).where(DBEntity.entity_id.in_(entity_ids))
            result = await self.session.execute(stmt)
            db_entities = result.scalars().all()

            # Create entity map
            entity_map = {e.entity_id: e for e in db_entities}

            # Create scoring policy if not provided
            if scoring_policy is None:
                from aml_filter.scoring.policy import create_preset_policy

                scoring_policy = create_preset_policy(
                    "balanced", f"default-{tenant_id or 'global'}", tenant_id or "global"
                )

            scorer = DefaultScoringPolicy(scoring_policy)

            # Score each candidate
            scored_matches: list[tuple[float, dict[str, Any]]] = []
            for entity_id, max_score, metadata in search_results:
                if entity_id not in entity_map:
                    continue

                db_entity = entity_map[entity_id]

                # Convert DB entity to domain entity
                domain_entity = self._db_to_domain_entity(db_entity)

                # Get similarities from search metadata
                vector_sim = metadata.get("vector_score")
                trigram_sim = metadata.get("lexical_score")

                # Compute score
                score, explanation = scorer.compute_score(
                    entity=domain_entity,
                    query_name=query.name,
                    query_name_canonical=query_name_canonical,
                    query_dob=query.dob,
                    query_country=query.country,
                    query_entity_type=query.entity_type,
                    vector_similarity=vector_sim,
                    trigram_similarity=trigram_sim,
                )

                # Filter by threshold
                if score >= query.threshold:
                    scored_matches.append((score, {"entity": domain_entity, "explanation": explanation}))

            # Sort by score (descending)
            scored_matches.sort(key=lambda x: x[0], reverse=True)

            # Take top K
            top_matches = scored_matches[: query.k]

            for score, match_data in top_matches:
                entity = match_data["entity"]
                explanation = match_data["explanation"]

                # Track list versions
                list_versions_used[entity.source_list] = entity.list_version

                # Convert explanation signals to MatchReason objects
                reasons = [
                    MatchReason(
                        signal=s["name"],
                        value=s["value"],
                        weight=s.get("weight"),
                        contribution=s.get("contribution"),
                        description=s.get("description"),
                    )
                    for s in explanation["signals"]
                ]

                match = Match(
                    entity_id=entity.entity_id,
                    score=score,
                    risk_category=entity.risk_category,
                    source_list=entity.source_list,
                    list_version=entity.list_version,
                    primary_name=entity.primary_name,
                    aliases=[alias.name for alias in entity.aliases],
                    countries=entity.countries,
                    dob=entity.dob,
                    reasons=reasons,
                    explanation=explanation["summary"],
                )
                response_matches.append(match)

        execution_time_ms = int((time.time() - start_time) * 1000)

        # PERSIST AUDIT RECORD
        if tenant_id:
            try:
                request_hash = self._compute_request_hash(query, tenant_id, scoring_policy)
                audit_record = SearchRequest(
                    request_id=request_id,
                    tenant_id=tenant_id,
                    user_id=user_id,
                    request_hash=request_hash,
                    query=query.model_dump(mode="json"),
                    policy_version=scoring_policy.version if scoring_policy else None,
                    list_versions_used=list_versions_used,
                    matches={"matches": [m.model_dump(mode="json") for m in response_matches]},
                    execution_time_ms=execution_time_ms,
                )
                self.session.add(audit_record)
                await self.session.commit()
            except Exception:
                # Best-effort: do not fail the request due to audit persistence issues.
                await self.session.rollback()

        return SearchResponse(
            request_id=request_id,
            matches=response_matches,
            list_versions_used=list_versions_used,
            execution_time_ms=execution_time_ms,
        )

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

        # Parse identifiers from dict to EntityIdentifier
        identifiers_dict = db_entity.identifiers or {}
        entity_identifiers = EntityIdentifier(**identifiers_dict) if identifiers_dict else EntityIdentifier()

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
            identifiers=entity_identifiers,
            risk_category=_safe_risk_category(db_entity.risk_category),
            source_list=db_entity.source_list,
            list_version=db_entity.list_version,
            custom_list_id=db_entity.custom_list_id,
            raw_source=db_entity.raw_source or {},
        )

