"""Unit tests for scoring policy."""

from datetime import date

import pytest

from aml_filter.domain.entity import Alias, Entity
from aml_filter.domain.scoring import ScoringPolicy, ScoringWeights
from aml_filter.scoring.policy import DefaultScoringPolicy, create_preset_policy


class TestDefaultScoringPolicy:
    """Test DefaultScoringPolicy."""

    @pytest.fixture
    def balanced_policy(self) -> ScoringPolicy:
        """Create balanced scoring policy."""
        return ScoringPolicy(
            policy_id="test-policy",
            tenant_id="test-tenant",
            name="Test Policy",
            weights=ScoringWeights(
                name_vector=0.55,
                name_trigram=0.20,
                alias_match=0.10,
                dob_match=0.10,
                country_match=0.05,
            ),
            threshold=0.65,
            version=1,
        )

    @pytest.fixture
    def test_entity(self) -> Entity:
        """Create test entity."""
        return Entity(
            entity_id="test-entity-1",
            entity_type="PERSON",
            primary_name="John Doe",
            name_canonical="john doe",
            name_tokens=["john", "doe"],
            name_trigram="john doe",
            aliases=[
                Alias(name="J. Doe", name_canonical="j. doe", source="OFAC"),
                Alias(name="Johnny Doe", name_canonical="johnny doe", source="OFAC"),
            ],
            dob=[date(1980, 1, 15)],
            countries=["US", "CA"],
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="2024-01",
        )

    def test_compute_score_with_vector_and_trigram(
        self, balanced_policy: ScoringPolicy, test_entity: Entity
    ):
        """Test score computation with vector and trigram similarities."""
        scorer = DefaultScoringPolicy(balanced_policy)
        score, explanation = scorer.compute_score(
            entity=test_entity,
            query_name="John Doe",
            query_name_canonical="john doe",
            query_dob=None,
            query_country=None,
            query_entity_type=None,
            vector_similarity=0.90,
            trigram_similarity=0.85,
        )

        assert 0.0 <= score <= 1.0
        assert explanation.signals
        assert 0.0 <= explanation.total_score <= 1.0
        assert explanation.summary

        # Check that vector and trigram contributions are included
        signal_names = [s.name for s in explanation.signals]
        assert "name_vector" in signal_names
        assert "name_trigram" in signal_names

        # Verify contributions
        vector_signal = next(s for s in explanation.signals if s.name == "name_vector")
        assert vector_signal.value == 0.90
        assert vector_signal.contribution == pytest.approx(0.55 * 0.90, abs=0.001)

    def test_compute_score_with_alias_match(
        self, balanced_policy: ScoringPolicy, test_entity: Entity
    ):
        """Test score computation with alias match."""
        scorer = DefaultScoringPolicy(balanced_policy)
        score, explanation = scorer.compute_score(
            entity=test_entity,
            query_name="J. Doe",
            query_name_canonical="j. doe",
            query_dob=None,
            query_country=None,
            query_entity_type=None,
            vector_similarity=0.70,
            trigram_similarity=0.60,
        )

        # Check for alias match signal
        signal_names = [s.name for s in explanation.signals]
        assert "alias_match" in signal_names

        alias_signal = next(s for s in explanation.signals if s.name == "alias_match")
        assert alias_signal.value == "J. Doe"  # Matched alias name
        assert alias_signal.contribution > 0

    def test_compute_score_with_dob_match(
        self, balanced_policy: ScoringPolicy, test_entity: Entity
    ):
        """Test score computation with DOB match."""
        scorer = DefaultScoringPolicy(balanced_policy)
        score, explanation = scorer.compute_score(
            entity=test_entity,
            query_name="John Doe",
            query_name_canonical="john doe",
            query_dob=date(1980, 1, 15),  # Exact match
            query_country=None,
            query_entity_type=None,
            vector_similarity=0.80,
            trigram_similarity=0.75,
        )

        dob_signal = next(s for s in explanation.signals if s.name == "dob_match")
        assert dob_signal.value == 1.0  # Exact match
        assert dob_signal.contribution == pytest.approx(0.10 * 1.0, abs=0.001)

    def test_compute_score_with_year_match(
        self, balanced_policy: ScoringPolicy, test_entity: Entity
    ):
        """Test score computation with year-only DOB match."""
        scorer = DefaultScoringPolicy(balanced_policy)
        score, explanation = scorer.compute_score(
            entity=test_entity,
            query_name="John Doe",
            query_name_canonical="john doe",
            query_dob=date(1980, 6, 20),  # Same year, different date
            query_country=None,
            query_entity_type=None,
            vector_similarity=0.80,
            trigram_similarity=0.75,
        )

        dob_signal = next(s for s in explanation.signals if s.name == "dob_match")
        assert dob_signal.value == 0.5  # Year match
        assert dob_signal.contribution == pytest.approx(0.10 * 0.5, abs=0.001)

    def test_compute_score_with_country_match(
        self, balanced_policy: ScoringPolicy, test_entity: Entity
    ):
        """Test score computation with country match."""
        scorer = DefaultScoringPolicy(balanced_policy)
        score, explanation = scorer.compute_score(
            entity=test_entity,
            query_name="John Doe",
            query_name_canonical="john doe",
            query_dob=None,
            query_country="US",  # Matches entity country
            query_entity_type=None,
            vector_similarity=0.80,
            trigram_similarity=0.75,
        )

        country_signal = next(s for s in explanation.signals if s.name == "country_match")
        assert country_signal.value > 0
        assert country_signal.contribution > 0

    def test_compute_score_with_entity_type_match(
        self, balanced_policy: ScoringPolicy, test_entity: Entity
    ):
        """Test score computation with entity type match."""
        scorer = DefaultScoringPolicy(balanced_policy)
        score, explanation = scorer.compute_score(
            entity=test_entity,
            query_name="John Doe",
            query_name_canonical="john doe",
            query_dob=None,
            query_country=None,
            query_entity_type="PERSON",  # Matches entity type
            vector_similarity=0.80,
            trigram_similarity=0.75,
        )

        entity_type_signal = next(s for s in explanation.signals if s.name == "entity_type_match")
        assert entity_type_signal.value == 1.0
        # Entity type is not weighted, so contribution is 0
        assert entity_type_signal.contribution == 0.0

    def test_compute_score_no_vector_similarity(
        self, balanced_policy: ScoringPolicy, test_entity: Entity
    ):
        """Test score computation without vector similarity."""
        scorer = DefaultScoringPolicy(balanced_policy)
        score, explanation = scorer.compute_score(
            entity=test_entity,
            query_name="John Doe",
            query_name_canonical="john doe",
            query_dob=None,
            query_country=None,
            query_entity_type=None,
            vector_similarity=None,
            trigram_similarity=0.85,
        )

        signal_names = [s.name for s in explanation.signals]
        assert "name_vector" not in signal_names
        assert "name_trigram" in signal_names

    def test_score_normalization(self, balanced_policy: ScoringPolicy, test_entity: Entity):
        """Test that scores are normalized to 0-1 range."""
        scorer = DefaultScoringPolicy(balanced_policy)
        score, _ = scorer.compute_score(
            entity=test_entity,
            query_name="John Doe",
            query_name_canonical="john doe",
            query_dob=None,
            query_country=None,
            query_entity_type=None,
            vector_similarity=1.0,
            trigram_similarity=1.0,
        )

        assert 0.0 <= score <= 1.0


class TestPresetPolicies:
    """Test preset policy creation."""

    def test_create_strict_policy(self):
        """Test creating strict preset policy."""
        policy = create_preset_policy("strict", "policy-1", "tenant-1")
        assert policy.preset == "strict"
        assert policy.threshold == 0.75
        assert policy.weights.name_vector == 0.60

    def test_create_balanced_policy(self):
        """Test creating balanced preset policy."""
        policy = create_preset_policy("balanced", "policy-2", "tenant-1")
        assert policy.preset == "balanced"
        assert policy.threshold == 0.65
        assert policy.weights.name_vector == 0.55

    def test_create_lenient_policy(self):
        """Test creating lenient preset policy."""
        policy = create_preset_policy("lenient", "policy-3", "tenant-1")
        assert policy.preset == "lenient"
        assert policy.threshold == 0.55
        assert policy.weights.name_vector == 0.50

    def test_create_preset_with_custom_name(self):
        """Test creating preset with custom name."""
        policy = create_preset_policy("balanced", "policy-4", "tenant-1", name="Custom Name")
        assert policy.name == "Custom Name"
        assert policy.preset == "balanced"

    def test_invalid_preset(self):
        """Test that invalid preset raises error."""
        with pytest.raises(ValueError, match="Unknown preset"):
            create_preset_policy("invalid", "policy-5", "tenant-1")
