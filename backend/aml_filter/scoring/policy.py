"""Scoring policy implementations."""

from datetime import date
from typing import Final, Literal, Protocol, runtime_checkable

from aml_filter.domain.entity import Entity
from aml_filter.domain.scoring import ScoringPolicy, ScoringWeights
from aml_filter.domain.search import MatchExplanation, MatchSignal

STRONG_SIMILARITY_THRESHOLD: Final[float] = 0.8
DOB_HALF_MATCH_THRESHOLD: Final[float] = 0.5


def _summarize(
    final_score: float,
    vector_similarity: float | None,
    trigram_similarity: float | None,
    alias_score: float,
    dob_score: float,
    country_score: float,
) -> str:
    """Human-readable summary of which signals carried this match."""
    parts: list[str] = []
    if vector_similarity and vector_similarity > STRONG_SIMILARITY_THRESHOLD:
        parts.append("strong vector similarity")
    if trigram_similarity and trigram_similarity > STRONG_SIMILARITY_THRESHOLD:
        parts.append("strong name match")
    if alias_score > 0:
        parts.append("alias match")
    if dob_score >= DOB_HALF_MATCH_THRESHOLD:
        parts.append("DOB match")
    if country_score > 0:
        parts.append("country match")
    if parts:
        return f"Match due to: {', '.join(parts)}"
    return f"Low confidence match (score: {final_score:.3f})"


@runtime_checkable
class ScoringPolicyProtocol(Protocol):
    """Protocol for scoring policy implementations."""

    def compute_score(
        self,
        entity: Entity,
        query_name: str,
        query_name_canonical: str,
        query_dob: date | None,
        query_country: str | None,
        query_entity_type: str | None,
        vector_similarity: float | None,
        trigram_similarity: float | None,
    ) -> tuple[float, MatchExplanation]:
        """Compute (score, explanation) for one (entity, query) pair."""
        ...


class DefaultScoringPolicy:
    """Default scoring policy implementation."""

    def __init__(self, policy: ScoringPolicy) -> None:
        """
        Initialize scoring policy.

        Args:
            policy: ScoringPolicy domain model with weights and threshold
        """
        self.policy = policy
        self.weights = policy.weights
        self.threshold = policy.threshold

    def _compute_alias_match(
        self, entity: Entity, query_name_canonical: str
    ) -> tuple[float, str | None]:
        """
        Compute alias match score.

        Returns:
            Tuple of (score, matched_alias_name)
        """
        query_lower = query_name_canonical.lower()
        for alias in entity.aliases:
            alias_canonical_lower = alias.name_canonical.lower()
            # Simple exact match check (could be enhanced with similarity)
            if query_lower == alias_canonical_lower:
                return (1.0, alias.name)
            # Check if query is contained in alias or vice versa
            if query_lower in alias_canonical_lower or alias_canonical_lower in query_lower:
                return (0.5, alias.name)
        return (0.0, None)

    def _compute_dob_match(self, entity: Entity, query_dob: date | None) -> tuple[float, str]:
        """
        Compute DOB match score.

        Returns:
            Tuple of (score, description)
        """
        if query_dob is None or not entity.dob:
            return (0.0, "No DOB provided or entity has no DOB")

        for entity_dob in entity.dob:
            if entity_dob == query_dob:
                return (1.0, f"Exact DOB match: {entity_dob}")

            # Year match
            if entity_dob.year == query_dob.year:
                return (0.5, f"Year match: {entity_dob.year}")

        return (0.0, "No DOB match")

    def _compute_country_match(
        self, entity: Entity, query_country: str | None
    ) -> tuple[float, str]:
        """
        Compute country match using Jaccard similarity.

        Returns:
            Tuple of (score, description)
        """
        if query_country is None or not entity.countries:
            return (0.0, "No country provided or entity has no countries")

        query_country_upper = query_country.upper()
        entity_countries_upper = {c.upper() for c in entity.countries}

        if query_country_upper in entity_countries_upper:
            # Jaccard similarity: intersection / union
            # If query country is in entity countries, similarity is at least 1/len(entity_countries)
            # For simplicity, we use 1.0 if exact match, or proportional if multiple countries
            if len(entity_countries_upper) == 1:
                return (1.0, f"Exact country match: {query_country_upper}")
            else:
                # Partial match - proportional to how many countries match
                return (
                    1.0 / len(entity_countries_upper),
                    f"Country match: {query_country_upper} in {entity_countries_upper}",
                )

        return (0.0, f"No country match: {query_country_upper} not in {entity_countries_upper}")

    def _compute_entity_type_match(
        self, entity: Entity, query_entity_type: str | None
    ) -> tuple[float, str]:
        """
        Compute entity type match.

        Returns:
            Tuple of (score, description)
        """
        if query_entity_type is None:
            return (0.0, "No entity type specified in query")

        if entity.entity_type.upper() == query_entity_type.upper():
            return (1.0, f"Entity type match: {entity.entity_type}")
        return (0.0, f"Entity type mismatch: {entity.entity_type} != {query_entity_type}")

    def compute_score(
        self,
        entity: Entity,
        query_name: str,  # noqa: ARG002 — required by ScoringPolicyProtocol
        query_name_canonical: str,
        query_dob: date | None,
        query_country: str | None,
        query_entity_type: str | None,
        vector_similarity: float | None,
        trigram_similarity: float | None,
    ) -> tuple[float, MatchExplanation]:
        """Compute (score, explanation) for one (entity, query) pair."""
        signals: list[MatchSignal] = []
        total = 0.0

        if vector_similarity is not None:
            total += self._add_weighted_signal(
                signals,
                "name_vector",
                vector_similarity,
                self.weights.name_vector,
                f"Vector similarity: {vector_similarity:.3f}",
            )
        if trigram_similarity is not None:
            total += self._add_weighted_signal(
                signals,
                "name_trigram",
                trigram_similarity,
                self.weights.name_trigram,
                f"Trigram similarity: {trigram_similarity:.3f}",
            )

        alias_score, matched_alias = self._compute_alias_match(entity, query_name_canonical)
        if alias_score > 0:
            total += self._add_weighted_signal(
                signals,
                "alias_match",
                alias_score,
                self.weights.alias_match,
                f"Alias match: {matched_alias}" if matched_alias else "No alias match",
                value_override=matched_alias or "",
            )

        dob_score, dob_desc = self._compute_dob_match(entity, query_dob)
        if dob_score > 0 or query_dob is not None:
            total += self._add_weighted_signal(
                signals,
                "dob_match",
                dob_score,
                self.weights.dob_match,
                dob_desc,
            )

        country_score, country_desc = self._compute_country_match(entity, query_country)
        if country_score > 0 or query_country is not None:
            total += self._add_weighted_signal(
                signals,
                "country_match",
                country_score,
                self.weights.country_match,
                country_desc,
            )

        entity_type_score, entity_type_desc = self._compute_entity_type_match(
            entity, query_entity_type
        )
        signals.append(
            MatchSignal(
                name="entity_type_match",
                value=entity_type_score,
                weight=0.0,
                contribution=0.0,
                description=entity_type_desc,
            )
        )

        final_score = max(0.0, min(1.0, total))
        return final_score, MatchExplanation(
            signals=signals,
            total_score=final_score,
            summary=_summarize(
                final_score,
                vector_similarity,
                trigram_similarity,
                alias_score,
                dob_score,
                country_score,
            ),
        )

    @staticmethod
    def _add_weighted_signal(
        signals: list[MatchSignal],
        name: str,
        score: float,
        weight: float,
        description: str,
        *,
        value_override: float | str | None = None,
    ) -> float:
        """Append a MatchSignal to `signals`; return its contribution to the total."""
        contribution = weight * score
        value: float | str = score if value_override is None else value_override
        signals.append(
            MatchSignal(
                name=name,
                value=value,
                weight=weight,
                contribution=contribution,
                description=description,
            )
        )
        return contribution


def create_preset_policy(
    preset: Literal["strict", "balanced", "lenient"],
    policy_id: str,
    tenant_id: str,
    name: str | None = None,
) -> ScoringPolicy:
    """
    Create a scoring policy from a preset.

    Args:
        preset: One of "strict", "balanced", "lenient"
        policy_id: Policy identifier
        tenant_id: Tenant identifier
        name: Optional policy name (defaults to preset name)

    Returns:
        ScoringPolicy instance
    """
    if preset == "strict":
        weights = ScoringWeights(
            name_vector=0.60,
            name_trigram=0.25,
            alias_match=0.05,
            dob_match=0.05,
            country_match=0.05,
        )
        threshold = 0.75
    elif preset == "balanced":
        weights = ScoringWeights(
            name_vector=0.55,
            name_trigram=0.20,
            alias_match=0.10,
            dob_match=0.10,
            country_match=0.05,
        )
        threshold = 0.65
    elif preset == "lenient":
        weights = ScoringWeights(
            name_vector=0.50,
            name_trigram=0.15,
            alias_match=0.15,
            dob_match=0.10,
            country_match=0.10,
        )
        threshold = 0.55
    else:
        raise ValueError(f"Unknown preset: {preset}. Must be one of: strict, balanced, lenient")

    return ScoringPolicy(
        policy_id=policy_id,
        tenant_id=tenant_id,
        name=name or f"{preset.capitalize()} Policy",
        weights=weights,
        threshold=threshold,
        version=1,
        preset=preset,
    )
