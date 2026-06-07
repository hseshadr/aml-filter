"""Match-strength tiers — a server-side classification over the final score.

This is a layer ON TOP of the parity-locked scoring contract: it never alters a
``Match``'s score, reasons, or explanation. It buckets the already-computed final
score into a review tier (STRONG / POSSIBLE / WEAK) so a review board can triage.

Bands are env-overridable, mirroring ``scoring/config.py``::

    TIER_STRONG=0.80
"""

from enum import StrEnum
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

STRONG_TIER_FLOOR: float = 0.80


class MatchTier(StrEnum):
    """Review tier for a match, ordered by descending strength."""

    STRONG = "STRONG"
    POSSIBLE = "POSSIBLE"
    WEAK = "WEAK"


def classify_tier(
    score: float,
    possible_threshold: float,
    strong: float = STRONG_TIER_FLOOR,
) -> MatchTier:
    """Bucket a final match score into a review tier.

    STRONG at/above ``strong``; POSSIBLE at/above the policy ``possible_threshold``;
    WEAK below it. Boundaries are inclusive on the lower edge of each tier.
    """
    if score >= strong:
        return MatchTier.STRONG
    if score >= possible_threshold:
        return MatchTier.POSSIBLE
    return MatchTier.WEAK


class TierBands(BaseSettings):
    """Env-overridable tier bands (prefix ``TIER_``)."""

    model_config = SettingsConfigDict(env_prefix="TIER_", extra="ignore", frozen=True)

    strong: float = STRONG_TIER_FLOOR

    def classify(self, score: float, possible_threshold: float) -> MatchTier:
        """Classify ``score`` using this band's strong floor and the policy threshold."""
        return classify_tier(score, possible_threshold=possible_threshold, strong=self.strong)


@lru_cache(maxsize=1)
def get_tier_bands() -> TierBands:
    """Return the cached process-wide TierBands."""
    return TierBands()
