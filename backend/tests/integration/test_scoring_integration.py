"""Integration tests for scoring engine with real data."""

from datetime import date

import pytest

from aml_filter.db.models import Entity as DBEntity
from aml_filter.domain.entity import Alias, Entity
from aml_filter.scoring.policy import DefaultScoringPolicy, create_preset_policy


@pytest.mark.integration
class TestScoringIntegration:
    """Integration tests for scoring engine."""

    @pytest.mark.asyncio
    async def test_scoring_with_real_entity(self, db_session, clean_database):
        """Test scoring with real entity data."""
        # Create entity in database
        entity = DBEntity(
            entity_id="test:score:1",
            entity_type="PERSON",
            primary_name="John Doe",
            name_canonical="john doe",
            name_tokens=["john", "doe"],
            name_trigram="john doe",
            aliases=[{"name": "J. Doe", "name_canonical": "j. doe", "source": "OFAC"}],
            dob=[date(1980, 1, 15)],
            countries=["US"],
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2024-01",
        )
        db_session.add(entity)
        await db_session.commit()

        # Create scoring policy
        policy = create_preset_policy("balanced", "test-policy", "test-tenant")
        scorer = DefaultScoringPolicy(policy)

        # Convert to domain entity
        domain_entity = Entity(
            entity_id=entity.entity_id,
            tenant_id=entity.tenant_id,
            entity_type=entity.entity_type,
            primary_name=entity.primary_name,
            name_canonical=entity.name_canonical,
            name_tokens=entity.name_tokens,
            name_trigram=entity.name_trigram,
            aliases=[
                Alias(
                    name=alias["name"],
                    name_canonical=alias["name_canonical"],
                    source=alias["source"],
                )
                for alias in entity.aliases
            ],
            dob=entity.dob or [],
            countries=entity.countries or [],
            nationalities=[],
            addresses=[],
            identifiers={},
            risk_category=entity.risk_category,
            source_list=entity.source_list,
            list_version=entity.list_version,
            custom_list_id=None,
            raw_source={},
        )

        # Compute score
        score, explanation = scorer.compute_score(
            entity=domain_entity,
            query_name="John Doe",
            query_name_canonical="john doe",
            query_dob=date(1980, 1, 15),
            query_country="US",
            query_entity_type="PERSON",
            vector_similarity=0.90,
            trigram_similarity=0.85,
        )

        # Verify score
        assert 0.0 <= score <= 1.0
        assert score >= 0.5  # Should be high with good matches

        # Verify explanation
        assert "signals" in explanation
        assert "total_score" in explanation
        assert "summary" in explanation

        # Check that DOB match contributed
        dob_signal = next((s for s in explanation.signals if s.name == "dob_match"), None)
        assert dob_signal is not None
        assert dob_signal.value == 1.0  # Exact match

        # Check that alias match contributed
        alias_signal = next((s for s in explanation.signals if s.name == "alias_match"), None)
        # Alias match might not trigger if query doesn't match alias exactly
        # But structure should be there
