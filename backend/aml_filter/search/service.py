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
from aml_filter.domain.search import (
    Match,
    MatchExplanation,
    MatchReason,
    SearchFilters,
    SearchQuery,
    SearchResponse,
)
from aml_filter.embedding.service import EmbeddingService
from aml_filter.scoring.policy import DefaultScoringPolicy, create_preset_policy
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
        """Run the full entity-screening pipeline and return scored matches."""
        start_time = time.time()
        request_id = str(uuid.uuid4())
        query_name_canonical = normalize_name(query.name)["name_canonical"]

        candidates = await self._fetch_candidates(query, query_name_canonical, tenant_id)
        policy = scoring_policy or create_preset_policy(
            "balanced", f"default-{tenant_id or 'global'}", tenant_id or "global"
        )
        scored = await self._score_candidates(candidates, query, query_name_canonical, policy)
        matches, list_versions_used = self._build_response_matches(scored[: query.k])

        execution_time_ms = int((time.time() - start_time) * 1000)
        if tenant_id:
            await self._persist_audit_record(
                request_id,
                tenant_id,
                user_id,
                query,
                policy,
                matches,
                list_versions_used,
                execution_time_ms,
            )
        return SearchResponse(
            request_id=request_id,
            matches=matches,
            list_versions_used=list_versions_used,
            execution_time_ms=execution_time_ms,
        )

    async def _fetch_candidates(
        self, query: SearchQuery, query_name_canonical: str, tenant_id: str | None
    ) -> list[tuple[str, float, dict[str, Any]]]:
        """Embed the query and hybrid-search for candidate entities (2x requested k)."""
        query_vector = await self.embedding_service.embed(
            prepare_embedding_text(query.name, query.country)
        )
        filters = SearchFilters(
            source_lists=query.lists,
            risk_categories=None,
            entity_types=[query.entity_type] if query.entity_type else None,
        )
        return await self.hybrid_search_service.search(
            query_vector=query_vector,
            query_text=query_name_canonical,
            k=query.k * 2,
            tenant_id=tenant_id,
            filters=filters,
        )

    async def _score_candidates(
        self,
        candidates: list[tuple[str, float, dict[str, Any]]],
        query: SearchQuery,
        query_name_canonical: str,
        policy: ScoringPolicy,
    ) -> list[tuple[float, Entity, MatchExplanation]]:
        """Load candidate entities, score each against the query, return above-threshold sorted desc."""
        entity_ids = [eid for eid, _, _ in candidates]
        if not entity_ids:
            return []
        result = await self.session.execute(
            select(DBEntity).where(DBEntity.entity_id.in_(entity_ids))
        )
        entity_map = {e.entity_id: e for e in result.scalars().all()}

        scorer = DefaultScoringPolicy(policy)
        scored: list[tuple[float, Entity, MatchExplanation]] = []
        for entity_id, _max_score, metadata in candidates:
            db_entity = entity_map.get(entity_id)
            if db_entity is None:
                continue
            domain_entity = self._db_to_domain_entity(db_entity)
            score, explanation = scorer.compute_score(
                entity=domain_entity,
                query_name=query.name,
                query_name_canonical=query_name_canonical,
                query_dob=query.dob,
                query_country=query.country,
                query_entity_type=query.entity_type,
                vector_similarity=metadata.get("vector_score"),
                trigram_similarity=metadata.get("lexical_score"),
            )
            if score >= query.threshold:
                scored.append((score, domain_entity, explanation))
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored

    @staticmethod
    def _build_response_matches(
        scored: list[tuple[float, Entity, MatchExplanation]],
    ) -> tuple[list[Match], dict[str, str]]:
        """Convert scored entities to API Match objects; collect source-list versions seen."""
        matches: list[Match] = []
        list_versions_used: dict[str, str] = {}
        for score, entity, explanation in scored:
            list_versions_used[entity.source_list] = entity.list_version
            reasons = [
                MatchReason(
                    signal=s.name,
                    value=s.value,
                    weight=s.weight,
                    contribution=s.contribution,
                    description=s.description,
                )
                for s in explanation.signals
            ]
            matches.append(
                Match(
                    entity_id=entity.entity_id,
                    score=score,
                    risk_category=entity.risk_category,
                    source_list=entity.source_list,
                    list_version=entity.list_version,
                    primary_name=entity.primary_name,
                    aliases=[a.name for a in entity.aliases],
                    countries=entity.countries,
                    dob=entity.dob,
                    reasons=reasons,
                    explanation=explanation.summary,
                )
            )
        return matches, list_versions_used

    async def _persist_audit_record(
        self,
        request_id: str,
        tenant_id: str,
        user_id: str | None,
        query: SearchQuery,
        policy: ScoringPolicy,
        matches: list[Match],
        list_versions_used: dict[str, str],
        execution_time_ms: int,
    ) -> None:
        """Persist the request/response audit row (best-effort: rollback on any failure)."""
        try:
            audit_record = SearchRequest(
                request_id=request_id,
                tenant_id=tenant_id,
                user_id=user_id,
                request_hash=self._compute_request_hash(query, tenant_id, policy),
                query=query.model_dump(mode="json"),
                policy_version=policy.version,
                list_versions_used=list_versions_used,
                matches={"matches": [m.model_dump(mode="json") for m in matches]},
                execution_time_ms=execution_time_ms,
            )
            self.session.add(audit_record)
            await self.session.commit()
        except Exception:  # noqa: BLE001 — audit is best-effort, never fail the request
            await self.session.rollback()

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
        entity_identifiers = (
            EntityIdentifier(**identifiers_dict) if identifiers_dict else EntityIdentifier()
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
            identifiers=entity_identifiers,
            risk_category=_safe_risk_category(db_entity.risk_category),
            source_list=db_entity.source_list,
            list_version=db_entity.list_version,
            custom_list_id=db_entity.custom_list_id,
            raw_source=db_entity.raw_source or {},
        )
