"""Unit tests for Scoring domain models."""

import pytest

from aml_filter.domain.scoring import ScoringPolicy, ScoringWeights


class TestScoringWeights:
    """Test ScoringWeights model."""

    def test_create_default_weights(self) -> None:
        """Test creating default weights."""
        weights = ScoringWeights()
        assert weights.name_vector == 0.55
        assert weights.name_trigram == 0.20
        assert weights.alias_match == 0.10
        assert weights.dob_match == 0.10
        assert weights.country_match == 0.05
        # Sum should be 1.0
        total = (
            weights.name_vector
            + weights.name_trigram
            + weights.alias_match
            + weights.dob_match
            + weights.country_match
        )
        assert abs(total - 1.0) < 0.01

    def test_create_custom_weights(self) -> None:
        """Test creating custom weights."""
        weights = ScoringWeights(
            name_vector=0.60,
            name_trigram=0.25,
            alias_match=0.10,
            dob_match=0.05,
            country_match=0.00,
        )
        assert weights.name_vector == 0.60
        total = (
            weights.name_vector
            + weights.name_trigram
            + weights.alias_match
            + weights.dob_match
            + weights.country_match
        )
        assert abs(total - 1.0) < 0.01


class TestScoringPolicy:
    """Test ScoringPolicy model."""

    def test_create_policy(self) -> None:
        """Test creating scoring policy."""
        policy = ScoringPolicy(
            policy_id="acme-default-v1",
            tenant_id="acme",
            name="Balanced",
            weights=ScoringWeights(),
            threshold=0.65,
            version=1,
            preset="balanced",
        )
        assert policy.policy_id == "acme-default-v1"
        assert policy.tenant_id == "acme"
        assert policy.name == "Balanced"
        assert policy.threshold == 0.65
        assert policy.version == 1
        assert policy.preset == "balanced"

    def test_policy_weights_validation(self) -> None:
        """Test policy validates weights sum."""
        # Valid weights
        valid_weights = ScoringWeights()
        policy = ScoringPolicy(
            policy_id="test",
            tenant_id="test",
            name="Test",
            weights=valid_weights,
            version=1,
        )
        assert policy is not None

        # Invalid weights - don't sum to 1.0
        invalid_weights = ScoringWeights(
            name_vector=0.90,  # Too high, total will exceed 1.0
            name_trigram=0.20,
            alias_match=0.10,
            dob_match=0.10,
            country_match=0.05,
        )
        with pytest.raises(ValueError, match="Weights must sum to 1.0"):
            ScoringPolicy(
                policy_id="test",
                tenant_id="test",
                name="Test",
                weights=invalid_weights,
                version=1,
            )

    def test_policy_threshold_validation(self) -> None:
        """Test threshold validation."""
        with pytest.raises(Exception):  # Pydantic validation error
            ScoringPolicy(
                policy_id="test",
                tenant_id="test",
                name="Test",
                weights=ScoringWeights(),
                threshold=1.5,  # > 1.0
                version=1,
            )
