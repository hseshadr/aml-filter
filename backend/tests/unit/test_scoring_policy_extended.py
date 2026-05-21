"""Extended unit tests for scoring policy - comprehensive coverage."""

from datetime import date

import pytest

from aml_filter.domain.entity import Alias, Entity
from aml_filter.domain.scoring import ScoringPolicy, ScoringWeights
from aml_filter.domain.search import MatchExplanation
from aml_filter.scoring.policy import (
    DefaultScoringPolicy,
    ScoringPolicyProtocol,
    create_preset_policy,
)


class TestDefaultScoringPolicyEdgeCases:
    """Test edge cases for DefaultScoringPolicy."""

    @pytest.fixture
    def strict_policy(self) -> ScoringPolicy:
        """Create strict scoring policy."""
        return ScoringPolicy(
            policy_id="strict-policy",
            tenant_id="test-tenant",
            name="Strict Policy",
            weights=ScoringWeights(
                name_vector=0.60,
                name_trigram=0.25,
                alias_match=0.05,
                dob_match=0.05,
                country_match=0.05,
            ),
            threshold=0.75,
            version=1,
        )

    @pytest.fixture
    def lenient_policy(self) -> ScoringPolicy:
        """Create lenient scoring policy."""
        return ScoringPolicy(
            policy_id="lenient-policy",
            tenant_id="test-tenant",
            name="Lenient Policy",
            weights=ScoringWeights(
                name_vector=0.50,
                name_trigram=0.15,
                alias_match=0.15,
                dob_match=0.10,
                country_match=0.10,
            ),
            threshold=0.55,
            version=1,
        )

    @pytest.fixture
    def entity_no_aliases(self) -> Entity:
        """Create entity with no aliases."""
        return Entity(
            entity_id="entity-no-alias",
            entity_type="PERSON",
            primary_name="Jane Smith",
            name_canonical="jane smith",
            name_tokens=["jane", "smith"],
            name_trigram="jane smith",
            aliases=[],
            dob=[date(1990, 5, 20)],
            countries=["GB"],
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="2024-01",
        )

    @pytest.fixture
    def entity_multiple_dobs(self) -> Entity:
        """Create entity with multiple DOBs."""
        return Entity(
            entity_id="entity-multi-dob",
            entity_type="PERSON",
            primary_name="Multi DOB Person",
            name_canonical="multi dob person",
            name_tokens=["multi", "dob", "person"],
            name_trigram="multi dob person",
            aliases=[],
            dob=[date(1980, 1, 1), date(1981, 2, 2), date(1982, 3, 3)],
            countries=["US"],
            risk_category="PEP",
            source_list="PEP_LIST",
            list_version="2024-01",
        )

    @pytest.fixture
    def entity_no_dob(self) -> Entity:
        """Create entity with no DOB."""
        return Entity(
            entity_id="entity-no-dob",
            entity_type="PERSON",
            primary_name="No DOB Person",
            name_canonical="no dob person",
            name_tokens=["no", "dob", "person"],
            name_trigram="no dob person",
            aliases=[],
            dob=[],
            countries=["FR"],
            risk_category="SANCTION",
            source_list="EU",
            list_version="2024-01",
        )

    @pytest.fixture
    def entity_no_countries(self) -> Entity:
        """Create entity with no countries."""
        return Entity(
            entity_id="entity-no-countries",
            entity_type="ORGANIZATION",
            primary_name="Unknown Origin Corp",
            name_canonical="unknown origin corp",
            name_tokens=["unknown", "origin", "corp"],
            name_trigram="unknown origin corp",
            aliases=[],
            dob=[],
            countries=[],
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="2024-01",
        )

    @pytest.fixture
    def entity_single_country(self) -> Entity:
        """Create entity with single country."""
        return Entity(
            entity_id="entity-single-country",
            entity_type="PERSON",
            primary_name="Single Country Person",
            name_canonical="single country person",
            name_tokens=["single", "country", "person"],
            name_trigram="single country person",
            aliases=[],
            dob=[],
            countries=["DE"],
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="2024-01",
        )

    @pytest.fixture
    def entity_many_aliases(self) -> Entity:
        """Create entity with many aliases."""
        return Entity(
            entity_id="entity-many-aliases",
            entity_type="PERSON",
            primary_name="Alias King",
            name_canonical="alias king",
            name_tokens=["alias", "king"],
            name_trigram="alias king",
            aliases=[
                Alias(name="A. King", name_canonical="a. king", source="OFAC"),
                Alias(name="AK", name_canonical="ak", source="OFAC"),
                Alias(name="The King", name_canonical="the king", source="EU"),
                Alias(name="King Alias", name_canonical="king alias", source="UN"),
                Alias(name="Alias K", name_canonical="alias k", source="OFAC"),
            ],
            dob=[],
            countries=["US", "CA"],
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="2024-01",
        )

    def test_no_similarities_provided(
        self, strict_policy: ScoringPolicy, entity_no_aliases: Entity
    ):
        """Test scoring with no similarities provided."""
        scorer = DefaultScoringPolicy(strict_policy)
        score, explanation = scorer.compute_score(
            entity=entity_no_aliases,
            query_name="Jane Smith",
            query_name_canonical="jane smith",
            query_dob=None,
            query_country=None,
            query_entity_type=None,
            vector_similarity=None,
            trigram_similarity=None,
        )

        assert score == 0.0
        assert len(explanation.signals) == 1  # Only entity_type_match
        assert explanation.summary == "Low confidence match (score: 0.000)"

    def test_zero_similarities(self, strict_policy: ScoringPolicy, entity_no_aliases: Entity):
        """Test scoring with zero similarities."""
        scorer = DefaultScoringPolicy(strict_policy)
        score, explanation = scorer.compute_score(
            entity=entity_no_aliases,
            query_name="Jane Smith",
            query_name_canonical="jane smith",
            query_dob=None,
            query_country=None,
            query_entity_type=None,
            vector_similarity=0.0,
            trigram_similarity=0.0,
        )

        assert score == 0.0
        signal_names = [s.name for s in explanation.signals]
        assert "name_vector" in signal_names
        assert "name_trigram" in signal_names

    def test_perfect_score(self, lenient_policy: ScoringPolicy, entity_many_aliases: Entity):
        """Test scoring with perfect similarities."""
        scorer = DefaultScoringPolicy(lenient_policy)
        score, explanation = scorer.compute_score(
            entity=entity_many_aliases,
            query_name="alias king",
            query_name_canonical="alias king",
            query_dob=None,
            query_country="US",
            query_entity_type="PERSON",
            vector_similarity=1.0,
            trigram_similarity=1.0,
        )

        # Score is based on weighted contributions - with lenient policy:
        # name_vector=0.50 * 1.0 = 0.50
        # name_trigram=0.15 * 1.0 = 0.15
        # alias_match=0.15 * 1.0 = 0.15 (exact match)
        # country_match=0.10 * 0.5 = 0.05 (US matches 1 of 2 countries)
        # Total around 0.85
        assert score >= 0.7
        assert score <= 1.0

    def test_dob_no_match_different_year(
        self, strict_policy: ScoringPolicy, entity_multiple_dobs: Entity
    ):
        """Test DOB scoring with completely different year."""
        scorer = DefaultScoringPolicy(strict_policy)
        score, explanation = scorer.compute_score(
            entity=entity_multiple_dobs,
            query_name="Multi DOB Person",
            query_name_canonical="multi dob person",
            query_dob=date(1999, 6, 15),  # No match at all
            query_country=None,
            query_entity_type=None,
            vector_similarity=0.8,
            trigram_similarity=0.7,
        )

        dob_signal = next(s for s in explanation.signals if s.name == "dob_match")
        assert dob_signal.value == 0.0
        assert dob_signal.description == "No DOB match"

    def test_dob_exact_match_second_dob(
        self, strict_policy: ScoringPolicy, entity_multiple_dobs: Entity
    ):
        """Test DOB scoring matches first found DOB."""
        scorer = DefaultScoringPolicy(strict_policy)
        score, explanation = scorer.compute_score(
            entity=entity_multiple_dobs,
            query_name="Multi DOB Person",
            query_name_canonical="multi dob person",
            query_dob=date(1981, 2, 2),  # Exact match to second DOB
            query_country=None,
            query_entity_type=None,
            vector_similarity=0.8,
            trigram_similarity=0.7,
        )

        dob_signal = next(s for s in explanation.signals if s.name == "dob_match")
        assert dob_signal.value == 1.0

    def test_dob_year_match_first_dob(
        self, strict_policy: ScoringPolicy, entity_multiple_dobs: Entity
    ):
        """Test DOB scoring with year match only."""
        scorer = DefaultScoringPolicy(strict_policy)
        score, explanation = scorer.compute_score(
            entity=entity_multiple_dobs,
            query_name="Multi DOB Person",
            query_name_canonical="multi dob person",
            query_dob=date(1980, 7, 15),  # Same year as first DOB
            query_country=None,
            query_entity_type=None,
            vector_similarity=0.8,
            trigram_similarity=0.7,
        )

        dob_signal = next(s for s in explanation.signals if s.name == "dob_match")
        assert dob_signal.value == 0.5

    def test_entity_no_dob_query_has_dob(self, strict_policy: ScoringPolicy, entity_no_dob: Entity):
        """Test DOB scoring when entity has no DOB but query does."""
        scorer = DefaultScoringPolicy(strict_policy)
        score, explanation = scorer.compute_score(
            entity=entity_no_dob,
            query_name="No DOB Person",
            query_name_canonical="no dob person",
            query_dob=date(1990, 1, 1),
            query_country=None,
            query_entity_type=None,
            vector_similarity=0.8,
            trigram_similarity=0.7,
        )

        dob_signal = next(s for s in explanation.signals if s.name == "dob_match")
        assert dob_signal.value == 0.0
        assert "No DOB provided or entity has no DOB" in dob_signal.description

    def test_country_no_match(self, strict_policy: ScoringPolicy, entity_single_country: Entity):
        """Test country scoring with no match."""
        scorer = DefaultScoringPolicy(strict_policy)
        score, explanation = scorer.compute_score(
            entity=entity_single_country,
            query_name="Single Country Person",
            query_name_canonical="single country person",
            query_dob=None,
            query_country="JP",  # Different country
            query_entity_type=None,
            vector_similarity=0.8,
            trigram_similarity=0.7,
        )

        country_signal = next(s for s in explanation.signals if s.name == "country_match")
        assert country_signal.value == 0.0

    def test_country_exact_match_single(
        self, strict_policy: ScoringPolicy, entity_single_country: Entity
    ):
        """Test country scoring with exact match (single country)."""
        scorer = DefaultScoringPolicy(strict_policy)
        score, explanation = scorer.compute_score(
            entity=entity_single_country,
            query_name="Single Country Person",
            query_name_canonical="single country person",
            query_dob=None,
            query_country="DE",  # Exact match
            query_entity_type=None,
            vector_similarity=0.8,
            trigram_similarity=0.7,
        )

        country_signal = next(s for s in explanation.signals if s.name == "country_match")
        assert country_signal.value == 1.0

    def test_country_partial_match_multiple(
        self, strict_policy: ScoringPolicy, entity_many_aliases: Entity
    ):
        """Test country scoring with partial match (multiple countries)."""
        scorer = DefaultScoringPolicy(strict_policy)
        score, explanation = scorer.compute_score(
            entity=entity_many_aliases,
            query_name="Alias King",
            query_name_canonical="alias king",
            query_dob=None,
            query_country="US",  # Matches one of two countries
            query_entity_type=None,
            vector_similarity=0.8,
            trigram_similarity=0.7,
        )

        country_signal = next(s for s in explanation.signals if s.name == "country_match")
        # Score should be 1/2 = 0.5 (US matches one of two countries: US, CA)
        assert country_signal.value == pytest.approx(0.5, abs=0.001)

    def test_country_case_insensitive(
        self, strict_policy: ScoringPolicy, entity_single_country: Entity
    ):
        """Test country matching is case insensitive."""
        scorer = DefaultScoringPolicy(strict_policy)
        score, explanation = scorer.compute_score(
            entity=entity_single_country,
            query_name="Single Country Person",
            query_name_canonical="single country person",
            query_dob=None,
            query_country="de",  # lowercase
            query_entity_type=None,
            vector_similarity=0.8,
            trigram_similarity=0.7,
        )

        country_signal = next(s for s in explanation.signals if s.name == "country_match")
        assert country_signal.value == 1.0

    def test_entity_no_countries_query_has_country(
        self, strict_policy: ScoringPolicy, entity_no_countries: Entity
    ):
        """Test country scoring when entity has no countries."""
        scorer = DefaultScoringPolicy(strict_policy)
        score, explanation = scorer.compute_score(
            entity=entity_no_countries,
            query_name="Unknown Origin Corp",
            query_name_canonical="unknown origin corp",
            query_dob=None,
            query_country="US",
            query_entity_type=None,
            vector_similarity=0.8,
            trigram_similarity=0.7,
        )

        country_signal = next(s for s in explanation.signals if s.name == "country_match")
        assert country_signal.value == 0.0
        assert "No country provided or entity has no countries" in country_signal.description

    def test_entity_type_mismatch(self, strict_policy: ScoringPolicy, entity_no_countries: Entity):
        """Test entity type mismatch."""
        scorer = DefaultScoringPolicy(strict_policy)
        score, explanation = scorer.compute_score(
            entity=entity_no_countries,  # ORGANIZATION
            query_name="Unknown Origin Corp",
            query_name_canonical="unknown origin corp",
            query_dob=None,
            query_country=None,
            query_entity_type="PERSON",  # Mismatch
            vector_similarity=0.8,
            trigram_similarity=0.7,
        )

        entity_type_signal = next(s for s in explanation.signals if s.name == "entity_type_match")
        assert entity_type_signal.value == 0.0
        assert "mismatch" in entity_type_signal.description.lower()

    def test_entity_type_case_insensitive(
        self, strict_policy: ScoringPolicy, entity_no_aliases: Entity
    ):
        """Test entity type matching is case insensitive."""
        scorer = DefaultScoringPolicy(strict_policy)
        score, explanation = scorer.compute_score(
            entity=entity_no_aliases,  # PERSON
            query_name="Jane Smith",
            query_name_canonical="jane smith",
            query_dob=None,
            query_country=None,
            query_entity_type="person",  # lowercase
            vector_similarity=0.8,
            trigram_similarity=0.7,
        )

        entity_type_signal = next(s for s in explanation.signals if s.name == "entity_type_match")
        assert entity_type_signal.value == 1.0

    def test_alias_exact_match(self, strict_policy: ScoringPolicy, entity_many_aliases: Entity):
        """Test alias exact match."""
        scorer = DefaultScoringPolicy(strict_policy)
        score, explanation = scorer.compute_score(
            entity=entity_many_aliases,
            query_name="A. King",
            query_name_canonical="a. king",
            query_dob=None,
            query_country=None,
            query_entity_type=None,
            vector_similarity=0.7,
            trigram_similarity=0.6,
        )

        alias_signal = next(s for s in explanation.signals if s.name == "alias_match")
        assert alias_signal.value == "A. King"
        assert alias_signal.contribution > 0

    def test_alias_partial_match_query_contained(
        self, strict_policy: ScoringPolicy, entity_many_aliases: Entity
    ):
        """Test alias partial match when query is contained in alias."""
        scorer = DefaultScoringPolicy(strict_policy)
        score, explanation = scorer.compute_score(
            entity=entity_many_aliases,
            query_name="king",
            query_name_canonical="king",  # Contained in "the king", "alias king", etc.
            query_dob=None,
            query_country=None,
            query_entity_type=None,
            vector_similarity=0.6,
            trigram_similarity=0.5,
        )

        signal_names = [s.name for s in explanation.signals]
        assert "alias_match" in signal_names
        alias_signal = next(s for s in explanation.signals if s.name == "alias_match")
        # Should have partial match (0.5 score)
        assert alias_signal.contribution > 0

    def test_alias_no_match(self, strict_policy: ScoringPolicy, entity_many_aliases: Entity):
        """Test alias with no match."""
        scorer = DefaultScoringPolicy(strict_policy)
        score, explanation = scorer.compute_score(
            entity=entity_many_aliases,
            query_name="Completely Different",
            query_name_canonical="completely different",
            query_dob=None,
            query_country=None,
            query_entity_type=None,
            vector_similarity=0.3,
            trigram_similarity=0.2,
        )

        signal_names = [s.name for s in explanation.signals]
        # alias_match signal should not be present when there's no match
        assert "alias_match" not in signal_names or all(
            s.contribution == 0 for s in explanation.signals if s.name == "alias_match"
        )

    def test_entity_with_no_aliases_query_matches_primary(
        self, strict_policy: ScoringPolicy, entity_no_aliases: Entity
    ):
        """Test entity with no aliases but query matches primary name."""
        scorer = DefaultScoringPolicy(strict_policy)
        score, explanation = scorer.compute_score(
            entity=entity_no_aliases,
            query_name="Jane Smith",
            query_name_canonical="jane smith",
            query_dob=None,
            query_country=None,
            query_entity_type=None,
            vector_similarity=0.9,
            trigram_similarity=0.9,
        )

        # Should still score well due to vector/trigram similarity
        assert score > 0.5

    def test_summary_strong_vector(self, strict_policy: ScoringPolicy, entity_no_aliases: Entity):
        """Test summary includes strong vector similarity."""
        scorer = DefaultScoringPolicy(strict_policy)
        _, explanation = scorer.compute_score(
            entity=entity_no_aliases,
            query_name="Jane Smith",
            query_name_canonical="jane smith",
            query_dob=None,
            query_country=None,
            query_entity_type=None,
            vector_similarity=0.95,
            trigram_similarity=0.5,
        )

        assert "strong vector similarity" in explanation.summary

    def test_summary_strong_name_match(
        self, strict_policy: ScoringPolicy, entity_no_aliases: Entity
    ):
        """Test summary includes strong name match."""
        scorer = DefaultScoringPolicy(strict_policy)
        _, explanation = scorer.compute_score(
            entity=entity_no_aliases,
            query_name="Jane Smith",
            query_name_canonical="jane smith",
            query_dob=None,
            query_country=None,
            query_entity_type=None,
            vector_similarity=0.5,
            trigram_similarity=0.95,
        )

        assert "strong name match" in explanation.summary

    def test_summary_multiple_reasons(
        self, lenient_policy: ScoringPolicy, entity_many_aliases: Entity
    ):
        """Test summary includes multiple reasons."""
        scorer = DefaultScoringPolicy(lenient_policy)
        _, explanation = scorer.compute_score(
            entity=entity_many_aliases,
            query_name="alias king",
            query_name_canonical="alias king",
            query_dob=None,
            query_country="US",
            query_entity_type=None,
            vector_similarity=0.9,
            trigram_similarity=0.9,
        )

        summary = explanation.summary
        assert "strong vector similarity" in summary
        assert "strong name match" in summary
        assert "country match" in summary

    def test_score_normalization_exceeds_one(
        self, lenient_policy: ScoringPolicy, entity_many_aliases: Entity
    ):
        """Test score is capped at 1.0 even if contributions exceed."""
        # Manually create a policy where weights could theoretically exceed 1.0
        # (though the domain model prevents this)
        scorer = DefaultScoringPolicy(lenient_policy)

        # Use perfect scores for everything
        score, _ = scorer.compute_score(
            entity=entity_many_aliases,
            query_name="a. king",
            query_name_canonical="a. king",
            query_dob=None,
            query_country="US",
            query_entity_type="PERSON",
            vector_similarity=1.0,
            trigram_similarity=1.0,
        )

        assert score <= 1.0
        assert score >= 0.0

    def test_score_normalization_negative(
        self, strict_policy: ScoringPolicy, entity_no_aliases: Entity
    ):
        """Test score is never negative."""
        scorer = DefaultScoringPolicy(strict_policy)

        score, _ = scorer.compute_score(
            entity=entity_no_aliases,
            query_name="Completely Different Name",
            query_name_canonical="completely different name",
            query_dob=None,
            query_country=None,
            query_entity_type=None,
            vector_similarity=0.0,
            trigram_similarity=0.0,
        )

        assert score >= 0.0


class TestAliasMatcher:
    """Test alias matching helper method."""

    @pytest.fixture
    def policy(self) -> ScoringPolicy:
        """Create policy for testing."""
        return create_preset_policy("balanced", "test", "tenant")

    def test_compute_alias_match_exact(self, policy: ScoringPolicy):
        """Test exact alias match."""
        entity = Entity(
            entity_id="test",
            entity_type="PERSON",
            primary_name="Test",
            name_canonical="test",
            name_tokens=["test"],
            name_trigram="test",
            aliases=[
                Alias(name="Test Alias", name_canonical="test alias", source="OFAC"),
            ],
            dob=[],
            countries=[],
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="v1",
        )

        scorer = DefaultScoringPolicy(policy)
        score, matched = scorer._compute_alias_match(entity, "test alias")

        assert score == 1.0
        assert matched == "Test Alias"

    def test_compute_alias_match_partial_query_in_alias(self, policy: ScoringPolicy):
        """Test partial alias match where query is in alias."""
        entity = Entity(
            entity_id="test",
            entity_type="PERSON",
            primary_name="Test",
            name_canonical="test",
            name_tokens=["test"],
            name_trigram="test",
            aliases=[
                Alias(name="Test Long Alias", name_canonical="test long alias", source="OFAC"),
            ],
            dob=[],
            countries=[],
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="v1",
        )

        scorer = DefaultScoringPolicy(policy)
        score, matched = scorer._compute_alias_match(entity, "long")

        assert score == 0.5
        assert matched == "Test Long Alias"

    def test_compute_alias_match_partial_alias_in_query(self, policy: ScoringPolicy):
        """Test partial alias match where alias is in query."""
        entity = Entity(
            entity_id="test",
            entity_type="PERSON",
            primary_name="Test",
            name_canonical="test",
            name_tokens=["test"],
            name_trigram="test",
            aliases=[
                Alias(name="Short", name_canonical="short", source="OFAC"),
            ],
            dob=[],
            countries=[],
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="v1",
        )

        scorer = DefaultScoringPolicy(policy)
        score, matched = scorer._compute_alias_match(entity, "short and long query")

        assert score == 0.5
        assert matched == "Short"

    def test_compute_alias_match_no_match(self, policy: ScoringPolicy):
        """Test no alias match."""
        entity = Entity(
            entity_id="test",
            entity_type="PERSON",
            primary_name="Test",
            name_canonical="test",
            name_tokens=["test"],
            name_trigram="test",
            aliases=[
                Alias(name="Something", name_canonical="something", source="OFAC"),
            ],
            dob=[],
            countries=[],
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="v1",
        )

        scorer = DefaultScoringPolicy(policy)
        score, matched = scorer._compute_alias_match(entity, "completely different")

        assert score == 0.0
        assert matched is None


class TestDobMatcher:
    """Test DOB matching helper method."""

    @pytest.fixture
    def policy(self) -> ScoringPolicy:
        """Create policy for testing."""
        return create_preset_policy("balanced", "test", "tenant")

    def test_compute_dob_match_exact(self, policy: ScoringPolicy):
        """Test exact DOB match."""
        entity = Entity(
            entity_id="test",
            entity_type="PERSON",
            primary_name="Test",
            name_canonical="test",
            name_tokens=["test"],
            name_trigram="test",
            aliases=[],
            dob=[date(1990, 5, 15)],
            countries=[],
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="v1",
        )

        scorer = DefaultScoringPolicy(policy)
        score, desc = scorer._compute_dob_match(entity, date(1990, 5, 15))

        assert score == 1.0
        assert "Exact DOB match" in desc

    def test_compute_dob_match_year_only(self, policy: ScoringPolicy):
        """Test year-only DOB match."""
        entity = Entity(
            entity_id="test",
            entity_type="PERSON",
            primary_name="Test",
            name_canonical="test",
            name_tokens=["test"],
            name_trigram="test",
            aliases=[],
            dob=[date(1990, 5, 15)],
            countries=[],
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="v1",
        )

        scorer = DefaultScoringPolicy(policy)
        score, desc = scorer._compute_dob_match(entity, date(1990, 12, 25))

        assert score == 0.5
        assert "Year match" in desc

    def test_compute_dob_match_no_query_dob(self, policy: ScoringPolicy):
        """Test DOB match with no query DOB."""
        entity = Entity(
            entity_id="test",
            entity_type="PERSON",
            primary_name="Test",
            name_canonical="test",
            name_tokens=["test"],
            name_trigram="test",
            aliases=[],
            dob=[date(1990, 5, 15)],
            countries=[],
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="v1",
        )

        scorer = DefaultScoringPolicy(policy)
        score, desc = scorer._compute_dob_match(entity, None)

        assert score == 0.0


class TestCountryMatcher:
    """Test country matching helper method."""

    @pytest.fixture
    def policy(self) -> ScoringPolicy:
        """Create policy for testing."""
        return create_preset_policy("balanced", "test", "tenant")

    def test_compute_country_match_exact_single(self, policy: ScoringPolicy):
        """Test exact country match with single country."""
        entity = Entity(
            entity_id="test",
            entity_type="PERSON",
            primary_name="Test",
            name_canonical="test",
            name_tokens=["test"],
            name_trigram="test",
            aliases=[],
            dob=[],
            countries=["US"],
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="v1",
        )

        scorer = DefaultScoringPolicy(policy)
        score, desc = scorer._compute_country_match(entity, "US")

        assert score == 1.0
        assert "Exact country match" in desc

    def test_compute_country_match_multiple_countries(self, policy: ScoringPolicy):
        """Test country match with multiple entity countries."""
        entity = Entity(
            entity_id="test",
            entity_type="PERSON",
            primary_name="Test",
            name_canonical="test",
            name_tokens=["test"],
            name_trigram="test",
            aliases=[],
            dob=[],
            countries=["US", "CA"],  # Two countries only (Entity has max_length=2)
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="v1",
        )

        scorer = DefaultScoringPolicy(policy)
        score, desc = scorer._compute_country_match(entity, "CA")

        assert score == pytest.approx(0.5, abs=0.001)  # 1/2

    def test_compute_country_match_no_match(self, policy: ScoringPolicy):
        """Test country match with no match."""
        entity = Entity(
            entity_id="test",
            entity_type="PERSON",
            primary_name="Test",
            name_canonical="test",
            name_tokens=["test"],
            name_trigram="test",
            aliases=[],
            dob=[],
            countries=["US", "CA"],
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="v1",
        )

        scorer = DefaultScoringPolicy(policy)
        score, desc = scorer._compute_country_match(entity, "JP")

        assert score == 0.0
        assert "No country match" in desc


class TestEntityTypeMatcher:
    """Test entity type matching helper method."""

    @pytest.fixture
    def policy(self) -> ScoringPolicy:
        """Create policy for testing."""
        return create_preset_policy("balanced", "test", "tenant")

    def test_compute_entity_type_match(self, policy: ScoringPolicy):
        """Test entity type match."""
        entity = Entity(
            entity_id="test",
            entity_type="PERSON",
            primary_name="Test",
            name_canonical="test",
            name_tokens=["test"],
            name_trigram="test",
            aliases=[],
            dob=[],
            countries=[],
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="v1",
        )

        scorer = DefaultScoringPolicy(policy)
        score, desc = scorer._compute_entity_type_match(entity, "PERSON")

        assert score == 1.0
        assert "Entity type match" in desc

    def test_compute_entity_type_mismatch(self, policy: ScoringPolicy):
        """Test entity type mismatch."""
        entity = Entity(
            entity_id="test",
            entity_type="ORGANIZATION",
            primary_name="Test Corp",
            name_canonical="test corp",
            name_tokens=["test", "corp"],
            name_trigram="test corp",
            aliases=[],
            dob=[],
            countries=[],
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="v1",
        )

        scorer = DefaultScoringPolicy(policy)
        score, desc = scorer._compute_entity_type_match(entity, "PERSON")

        assert score == 0.0
        assert "mismatch" in desc.lower()

    def test_compute_entity_type_none(self, policy: ScoringPolicy):
        """Test entity type with no query type."""
        entity = Entity(
            entity_id="test",
            entity_type="PERSON",
            primary_name="Test",
            name_canonical="test",
            name_tokens=["test"],
            name_trigram="test",
            aliases=[],
            dob=[],
            countries=[],
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="v1",
        )

        scorer = DefaultScoringPolicy(policy)
        score, desc = scorer._compute_entity_type_match(entity, None)

        assert score == 0.0
        assert "No entity type specified" in desc


class TestCreatePresetPolicyExtended:
    """Extended tests for preset policy creation."""

    def test_strict_weights_sum_to_one(self):
        """Test strict preset weights sum to 1.0."""
        policy = create_preset_policy("strict", "p1", "t1")
        total = (
            policy.weights.name_vector
            + policy.weights.name_trigram
            + policy.weights.alias_match
            + policy.weights.dob_match
            + policy.weights.country_match
        )
        assert abs(total - 1.0) < 0.01

    def test_balanced_weights_sum_to_one(self):
        """Test balanced preset weights sum to 1.0."""
        policy = create_preset_policy("balanced", "p2", "t1")
        total = (
            policy.weights.name_vector
            + policy.weights.name_trigram
            + policy.weights.alias_match
            + policy.weights.dob_match
            + policy.weights.country_match
        )
        assert abs(total - 1.0) < 0.01

    def test_lenient_weights_sum_to_one(self):
        """Test lenient preset weights sum to 1.0."""
        policy = create_preset_policy("lenient", "p3", "t1")
        total = (
            policy.weights.name_vector
            + policy.weights.name_trigram
            + policy.weights.alias_match
            + policy.weights.dob_match
            + policy.weights.country_match
        )
        assert abs(total - 1.0) < 0.01

    def test_default_name_generation(self):
        """Test default name is generated from preset."""
        policy = create_preset_policy("strict", "p1", "t1")
        assert policy.name == "Strict Policy"

        policy = create_preset_policy("balanced", "p2", "t1")
        assert policy.name == "Balanced Policy"

        policy = create_preset_policy("lenient", "p3", "t1")
        assert policy.name == "Lenient Policy"

    def test_version_is_one(self):
        """Test that preset policies start at version 1."""
        policy = create_preset_policy("balanced", "p1", "t1")
        assert policy.version == 1

    def test_policy_id_tenant_id_preserved(self):
        """Test that policy_id and tenant_id are preserved."""
        policy = create_preset_policy("balanced", "my-policy-123", "tenant-xyz")
        assert policy.policy_id == "my-policy-123"
        assert policy.tenant_id == "tenant-xyz"


class TestScoringPolicyProtocol:
    """Test that DefaultScoringPolicy implements the protocol."""

    def test_implements_protocol(self):
        """Test that DefaultScoringPolicy is runtime checkable for protocol."""
        policy = create_preset_policy("balanced", "test", "tenant")
        scorer = DefaultScoringPolicy(policy)

        # Check that it implements the protocol
        assert isinstance(scorer, ScoringPolicyProtocol)

    def test_protocol_method_signature(self):
        """Test that compute_score has correct return type."""
        policy = create_preset_policy("balanced", "test", "tenant")
        scorer = DefaultScoringPolicy(policy)

        entity = Entity(
            entity_id="test",
            entity_type="PERSON",
            primary_name="Test",
            name_canonical="test",
            name_tokens=["test"],
            name_trigram="test",
            aliases=[],
            dob=[],
            countries=[],
            risk_category="SANCTION",
            source_list="OFAC",
            list_version="v1",
        )

        result = scorer.compute_score(
            entity=entity,
            query_name="Test",
            query_name_canonical="test",
            query_dob=None,
            query_country=None,
            query_entity_type=None,
            vector_similarity=0.5,
            trigram_similarity=0.5,
        )

        assert isinstance(result, tuple)
        assert len(result) == 2
        assert isinstance(result[0], float)
        assert isinstance(result[1], MatchExplanation)
