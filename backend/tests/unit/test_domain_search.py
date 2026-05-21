"""Unit tests for Search domain models."""

from datetime import date

import pytest

from aml_filter.domain.search import Match, MatchReason, SearchQuery, SearchResponse


class TestSearchQuery:
    """Test SearchQuery model."""

    def test_create_minimal_query(self) -> None:
        """Test creating minimal query."""
        query = SearchQuery(name="Mohammed Ali")
        assert query.name == "Mohammed Ali"
        assert query.dob is None
        assert query.country is None
        assert query.entity_type is None
        assert query.threshold == 0.65
        assert query.k == 20

    def test_create_full_query(self) -> None:
        """Test creating query with all fields."""
        query = SearchQuery(
            name="Mohammed Ali",
            dob=date(1985, 2, 10),
            country="PK",
            entity_type="PERSON",
            threshold=0.75,
            k=50,
            lists=["ofac_sdn"],
            policy_id="custom-policy",
        )
        assert query.name == "Mohammed Ali"
        assert query.dob == date(1985, 2, 10)
        assert query.country == "PK"
        assert query.entity_type == "PERSON"
        assert query.threshold == 0.75
        assert query.k == 50
        assert query.lists == ["ofac_sdn"]
        assert query.policy_id == "custom-policy"

    def test_query_threshold_validation(self) -> None:
        """Test threshold validation."""
        with pytest.raises(Exception):  # Pydantic validation error
            SearchQuery(name="Test", threshold=1.5)  # > 1.0

        with pytest.raises(Exception):  # Pydantic validation error
            SearchQuery(name="Test", threshold=-0.1)  # < 0.0

    def test_query_k_validation(self) -> None:
        """Test k validation."""
        with pytest.raises(Exception):  # Pydantic validation error
            SearchQuery(name="Test", k=0)  # < 1

        with pytest.raises(Exception):  # Pydantic validation error
            SearchQuery(name="Test", k=200)  # > 100


class TestMatchReason:
    """Test MatchReason model."""

    def test_create_reason_with_string_value(self) -> None:
        """Test creating reason with string value."""
        reason = MatchReason(
            signal="alias",
            value="MUHAMMAD ALI",
            description="Matched alias",
        )
        assert reason.signal == "alias"
        assert reason.value == "MUHAMMAD ALI"
        assert reason.description == "Matched alias"

    def test_create_reason_with_float_value(self) -> None:
        """Test creating reason with float value."""
        reason = MatchReason(
            signal="name_vector",
            value=0.92,
            weight=0.55,
            contribution=0.506,
        )
        assert reason.signal == "name_vector"
        assert reason.value == 0.92
        assert reason.weight == 0.55
        assert reason.contribution == 0.506


class TestMatch:
    """Test Match model."""

    def test_create_match(self) -> None:
        """Test creating match."""
        match = Match(
            entity_id="ofac:sdn:12345",
            score=0.87,
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2025-12-28",
            primary_name="MOHAMMED ALI",
            explanation="High confidence match",
        )
        assert match.entity_id == "ofac:sdn:12345"
        assert match.score == 0.87
        assert match.risk_category == "SANCTION"
        assert match.reasons == []
        assert match.aliases == []


class TestSearchResponse:
    """Test SearchResponse model."""

    def test_create_empty_response(self) -> None:
        """Test creating empty response."""
        response = SearchResponse(request_id="req_123")
        assert response.request_id == "req_123"
        assert response.matches == []
        assert response.list_versions_used == {}

    def test_create_response_with_matches(self) -> None:
        """Test creating response with matches."""
        match = Match(
            entity_id="ofac:sdn:12345",
            score=0.87,
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2025-12-28",
            primary_name="MOHAMMED ALI",
            explanation="High confidence match",
        )
        response = SearchResponse(
            request_id="req_123",
            matches=[match],
            list_versions_used={"ofac_sdn": "2025-12-28"},
            execution_time_ms=145,
        )
        assert len(response.matches) == 1
        assert response.matches[0].entity_id == "ofac:sdn:12345"
        assert response.list_versions_used["ofac_sdn"] == "2025-12-28"
        assert response.execution_time_ms == 145
