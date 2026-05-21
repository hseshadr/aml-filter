"""Scoring policy domain models."""

from typing import Final, Literal

from pydantic import BaseModel, Field, field_validator

WEIGHT_SUM_TOLERANCE: Final[float] = 0.01


class ScoringWeights(BaseModel):
    """Scoring weights configuration."""

    name_vector: float = Field(default=0.55, ge=0.0, le=1.0)
    name_trigram: float = Field(default=0.20, ge=0.0, le=1.0)
    alias_match: float = Field(default=0.10, ge=0.0, le=1.0)
    dob_match: float = Field(default=0.10, ge=0.0, le=1.0)
    country_match: float = Field(default=0.05, ge=0.0, le=1.0)

    @field_validator("*", mode="after")
    @classmethod
    def validate_weights_sum(cls, v: float) -> float:
        """Validate that weights sum to approximately 1.0."""
        # Weights will be validated at the policy level
        return v


class ScoringPolicy(BaseModel):
    """Versioned scoring policy."""

    policy_id: str = Field(..., min_length=1, max_length=200)
    tenant_id: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=200)
    weights: ScoringWeights = Field(...)
    threshold: float = Field(0.65, ge=0.0, le=1.0)
    version: int = Field(..., ge=1)
    preset: Literal["strict", "balanced", "lenient", "custom"] | None = None

    @field_validator("weights", mode="after")
    @classmethod
    def validate_weights_sum(cls, v: ScoringWeights) -> ScoringWeights:
        """Validate that all weights sum to approximately 1.0."""
        total = v.name_vector + v.name_trigram + v.alias_match + v.dob_match + v.country_match
        if abs(total - 1.0) > WEIGHT_SUM_TOLERANCE:
            raise ValueError(
                f"Weights must sum to 1.0, got {total:.3f}. "
                f"Adjust weights: vector={v.name_vector}, trigram={v.name_trigram}, "
                f"alias={v.alias_match}, dob={v.dob_match}, country={v.country_match}"
            )
        return v
