"""Typed, env-overridable defaults for scoring presets.

Numeric defaults preserve historical behaviour exactly. An operator can tune any
value via environment variables without editing source, e.g.::

    SCORING_DEFAULT_THRESHOLD=0.70
    SCORING_STRICT__THRESHOLD=0.80
    SCORING_STRICT__WEIGHTS__NAME_VECTOR=0.62
"""

from functools import lru_cache

from pydantic import BaseModel, ConfigDict
from pydantic_settings import BaseSettings, SettingsConfigDict

from aml_filter.domain.scoring import ScoringWeights

# Historical default threshold used when initialising a tenant's default policy.
DEFAULT_THRESHOLD: float = 0.65


class PresetConfig(BaseModel):
    """Weights + threshold for a single named preset."""

    model_config = ConfigDict(frozen=True)

    weights: ScoringWeights
    threshold: float


_STRICT = PresetConfig(
    weights=ScoringWeights(
        name_vector=0.60, name_trigram=0.25, alias_match=0.05, dob_match=0.05, country_match=0.05
    ),
    threshold=0.75,
)
_BALANCED = PresetConfig(
    weights=ScoringWeights(
        name_vector=0.55, name_trigram=0.20, alias_match=0.10, dob_match=0.10, country_match=0.05
    ),
    threshold=0.65,
)
_LENIENT = PresetConfig(
    weights=ScoringWeights(
        name_vector=0.50, name_trigram=0.15, alias_match=0.15, dob_match=0.10, country_match=0.10
    ),
    threshold=0.55,
)


class ScoringDefaults(BaseSettings):
    """Env-overridable scoring defaults (prefix ``SCORING_``)."""

    model_config = SettingsConfigDict(
        env_prefix="SCORING_", env_nested_delimiter="__", extra="ignore", frozen=True
    )

    default_threshold: float = DEFAULT_THRESHOLD
    strict: PresetConfig = _STRICT
    balanced: PresetConfig = _BALANCED
    lenient: PresetConfig = _LENIENT

    def preset(self, name: str) -> PresetConfig:
        """Return the PresetConfig for ``name`` (strict/balanced/lenient)."""
        return {"strict": self.strict, "balanced": self.balanced, "lenient": self.lenient}[name]


@lru_cache(maxsize=1)
def get_scoring_defaults() -> ScoringDefaults:
    """Return the cached process-wide ScoringDefaults."""
    return ScoringDefaults()
