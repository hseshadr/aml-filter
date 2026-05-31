"""Bundle-backed screening: score a query against a synced bundle, no Postgres.

Sources OFAC candidates from the bundle's localvec index and entity metadata from
``entities.jsonl`` (held in memory), then reuses the unchanged ``DefaultScoringPolicy``
to produce a ``SearchResponse`` whose ``list_versions_used`` carries the bundle version.

The DB-backed ``SearchService`` blends a pg_trgm lexical signal; without Postgres the
bundle path derives the trigram similarity in Python so name scoring stays meaningful.
"""

from __future__ import annotations

import time
import uuid
from difflib import SequenceMatcher

from aml_filter.bundle.sync import SyncedBundle
from aml_filter.domain.entity import Entity
from aml_filter.domain.normalization import normalize_name
from aml_filter.domain.scoring import ScoringPolicy
from aml_filter.domain.search import (
    Match,
    MatchExplanation,
    MatchReason,
    MatchSignal,
    SearchFilters,
    SearchQuery,
    SearchResponse,
)
from aml_filter.scoring.policy import DefaultScoringPolicy, create_preset_policy


class BundleScreeningSource:
    """Screen queries against a synced OFAC bundle (vector candidates + in-memory entities)."""

    def __init__(self, bundle: SyncedBundle) -> None:
        self._bundle = bundle

    async def screen(
        self,
        query: SearchQuery,
        query_vector: list[float],
        tenant_id: str | None = None,
        scoring_policy: ScoringPolicy | None = None,
    ) -> SearchResponse:
        """Run the bundle screening pipeline and return scored matches (no DB)."""
        start = time.time()
        query_canonical = normalize_name(query.name).name_canonical
        candidates = await self._fetch_candidates(query, query_vector, tenant_id)
        policy = scoring_policy or create_preset_policy(
            "balanced", f"default-{tenant_id or 'global'}", tenant_id or "global"
        )
        scored = self._score(candidates, query, query_canonical, policy)
        matches, versions = self._build_matches(scored[: query.k])
        return SearchResponse(
            request_id=str(uuid.uuid4()),
            matches=matches,
            list_versions_used=versions,
            execution_time_ms=int((time.time() - start) * 1000),
        )

    async def _fetch_candidates(
        self, query: SearchQuery, query_vector: list[float], tenant_id: str | None
    ) -> list[tuple[str, float]]:
        """Vector-search the bundle index for (entity_id, similarity) candidates."""
        filters = SearchFilters(
            source_lists=query.lists,
            risk_categories=None,
            entity_types=[query.entity_type] if query.entity_type else None,
        )
        hits = await self._bundle.vector_backend.vector_search(
            query_vector=query_vector, k=query.k * 2, tenant_id=tenant_id, filters=filters
        )
        return [(eid, 1.0 - distance) for eid, distance in hits]

    def _score(
        self,
        candidates: list[tuple[str, float]],
        query: SearchQuery,
        query_canonical: str,
        policy: ScoringPolicy,
    ) -> list[tuple[float, Entity, MatchExplanation]]:
        """Score each candidate above threshold, sorted by score descending."""
        scorer = DefaultScoringPolicy(policy)
        scored = [
            row
            for eid, sim in candidates
            if (row := self._score_one(eid, sim, query, query_canonical, scorer)) is not None
        ]
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored

    def _score_one(
        self,
        entity_id: str,
        vector_similarity: float,
        query: SearchQuery,
        query_canonical: str,
        scorer: DefaultScoringPolicy,
    ) -> tuple[float, Entity, MatchExplanation] | None:
        """Score one candidate; return (score, entity, explanation) if above threshold."""
        entity = self._bundle.entities_by_id.get(entity_id)
        if entity is None:
            return None
        score, explanation = scorer.compute_score(
            entity=entity,
            query_name=query.name,
            query_name_canonical=query_canonical,
            query_dob=query.dob,
            query_country=query.country,
            query_entity_type=query.entity_type,
            vector_similarity=vector_similarity,
            trigram_similarity=_trigram_similarity(query_canonical, entity.name_canonical),
        )
        return (score, entity, explanation) if score >= query.threshold else None

    @staticmethod
    def _build_matches(
        scored: list[tuple[float, Entity, MatchExplanation]],
    ) -> tuple[list[Match], dict[str, str]]:
        """Convert scored entities to API Match objects; collect source-list versions."""
        matches: list[Match] = []
        versions: dict[str, str] = {}
        for score, entity, explanation in scored:
            versions[entity.source_list] = entity.list_version
            matches.append(_to_match(score, entity, explanation))
        return matches, versions


def _to_match(score: float, entity: Entity, explanation: MatchExplanation) -> Match:
    """Build the API Match for one scored entity."""
    return Match(
        entity_id=entity.entity_id,
        score=score,
        risk_category=entity.risk_category,
        source_list=entity.source_list,
        list_version=entity.list_version,
        primary_name=entity.primary_name,
        aliases=[a.name for a in entity.aliases],
        countries=entity.countries,
        dob=entity.dob,
        reasons=[_to_reason(s) for s in explanation.signals],
        explanation=explanation.summary,
    )


def _to_reason(signal: MatchSignal) -> MatchReason:
    """Project an internal MatchSignal onto the public MatchReason shape."""
    return MatchReason(
        signal=signal.name,
        value=signal.value,
        weight=signal.weight,
        contribution=signal.contribution,
        description=signal.description,
    )


def _trigram_similarity(query_canonical: str, entity_canonical: str) -> float:
    """A Python stand-in for pg_trgm similarity (0-1) used in the no-Postgres path."""
    if not query_canonical or not entity_canonical:
        return 0.0
    return SequenceMatcher(None, query_canonical, entity_canonical).ratio()
