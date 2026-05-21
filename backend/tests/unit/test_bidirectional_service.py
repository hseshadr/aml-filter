"""Unit tests for BidirectionalScreeningService."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aml_filter.db.models import Entity as DBEntity
from aml_filter.screening.bidirectional import BidirectionalScreeningService


@pytest.fixture
def mock_session():
    return AsyncMock()


@pytest.fixture
def mock_search_service():
    return AsyncMock()


@pytest.fixture
def mock_match_tracker():
    return AsyncMock()


@pytest.fixture
def mock_embedding_service():
    service = MagicMock()
    service.embed = AsyncMock(return_value=[0.1] * 384)
    service.get_model_info.return_value = {"model_name": "test-model"}
    return service


@pytest.fixture
def service(mock_session, mock_search_service, mock_match_tracker, mock_embedding_service):
    return BidirectionalScreeningService(
        session=mock_session,
        search_service=mock_search_service,
        match_tracker=mock_match_tracker,
        embedding_service=mock_embedding_service,
    )


@pytest.mark.asyncio
async def test_screen_whitelist_against_blacklist(service, mock_session):
    """Test screening whitelist against blacklist."""
    # Mock whitelist entities
    e1 = MagicMock(spec=DBEntity)
    e1.entity_id = "w1"
    e1.tenant_id = "t1"
    e1.risk_category = "WHITELIST"
    e1.primary_name = "John Doe"
    e1.name_canonical = "john doe"
    e1.countries = ["US"]
    e1.dob = []
    e1.aliases = []
    e1.identifiers = {}

    mock_result = MagicMock()
    mock_result.scalars().all.return_value = [e1]
    mock_session.execute.return_value = mock_result

    # Mock screen_entity_against_list (internal call)
    with patch.object(service, "screen_entity_against_list", new_callable=AsyncMock) as mock_screen:
        mock_screen.return_value = ["b1"]

        results = await service.screen_whitelist_against_blacklist("t1")

        assert results["entities_scanned"] == 1
        assert results["matches_found"] == 1
        mock_screen.assert_called_once()


@pytest.mark.asyncio
async def test_screen_blacklist_against_whitelist(service, mock_session):
    """Test screening blacklist against whitelist."""
    # Mock blacklist entities
    b1 = MagicMock(spec=DBEntity)
    b1.entity_id = "b1"
    b1.tenant_id = None
    b1.risk_category = "SANCTION"
    b1.primary_name = "Bad Guy"
    b1.name_canonical = "bad guy"
    b1.countries = []
    b1.dob = []
    b1.aliases = []
    b1.identifiers = {}

    mock_result = MagicMock()
    mock_result.scalars().all.side_effect = [
        [b1],
        [MagicMock(tenant_id="t1")],
    ]  # Blacklist, then Tenants
    mock_session.execute.return_value = mock_result

    with patch.object(service, "screen_entity_against_list", new_callable=AsyncMock) as mock_screen:
        mock_screen.return_value = ["w1"]

        results = await service.screen_blacklist_against_whitelist(
            list_id="OFAC", list_version="v1"
        )

        assert results["entities_scanned"] == 1
        assert results["matches_found"] == 1
        mock_screen.assert_called_once()


@pytest.mark.asyncio
async def test_screen_entity_against_list_no_matches(service, mock_session):
    """Test screen_entity_against_list with no matches."""
    entity = MagicMock(spec=DBEntity)
    entity.entity_id = "w1"
    entity.tenant_id = "t1"
    entity.entity_type = "PERSON"
    entity.primary_name = "John Doe"
    entity.name_canonical = "john doe"
    entity.name_tokens = ["john", "doe"]
    entity.name_trigram = "john doe"
    entity.risk_category = "WHITELIST"
    entity.source_list = "WHITELIST"
    entity.list_version = "v1"
    entity.custom_list_id = None
    entity.countries = []
    entity.nationalities = []
    entity.addresses = []
    entity.dob = []
    entity.aliases = []
    entity.identifiers = {}
    entity.raw_source = {}

    with patch(
        "aml_filter.screening.bidirectional.HybridSearchService", new_callable=MagicMock
    ) as mock_hybrid_class:
        mock_hybrid = AsyncMock()
        mock_hybrid_class.return_value = mock_hybrid
        mock_hybrid.search.return_value = []  # No search results

        matches = await service.screen_entity_against_list(
            entity=entity, target_risk_category="SANCTION", tenant_id="t1"
        )

        assert matches == []


@pytest.mark.asyncio
async def test_screen_entity_against_list_with_matches(service, mock_session):
    """Test screen_entity_against_list with matches and scoring."""
    entity = MagicMock(spec=DBEntity)
    entity.entity_id = "w1"
    entity.tenant_id = "t1"
    entity.entity_type = "PERSON"
    entity.primary_name = "John Doe"
    entity.name_canonical = "john doe"
    entity.name_tokens = ["john", "doe"]
    entity.name_trigram = "john doe"
    entity.risk_category = "WHITELIST"
    entity.source_list = "WHITELIST"
    entity.list_version = "v1"
    entity.custom_list_id = None
    entity.countries = []
    entity.nationalities = []
    entity.addresses = []
    entity.dob = []
    entity.aliases = []
    entity.identifiers = {}
    entity.raw_source = {}

    match_entity = MagicMock(spec=DBEntity)
    match_entity.entity_id = "b1"
    match_entity.tenant_id = None
    match_entity.entity_type = "PERSON"
    match_entity.risk_category = "SANCTION"
    match_entity.primary_name = "John Doe"
    match_entity.name_canonical = "john doe"
    match_entity.name_tokens = ["john", "doe"]
    match_entity.name_trigram = "john doe"
    match_entity.source_list = "OFAC"
    match_entity.list_version = "v1"
    match_entity.custom_list_id = None
    match_entity.countries = []
    match_entity.nationalities = []
    match_entity.addresses = []
    match_entity.dob = []
    match_entity.aliases = []
    match_entity.identifiers = {}
    match_entity.raw_source = {}

    with (
        patch(
            "aml_filter.screening.bidirectional.HybridSearchService", new_callable=MagicMock
        ) as mock_hybrid_class,
        patch(
            "aml_filter.screening.bidirectional.DefaultScoringPolicy", new_callable=MagicMock
        ) as mock_scorer_class,
    ):
        mock_hybrid = AsyncMock()
        mock_hybrid_class.return_value = mock_hybrid
        mock_hybrid.search.return_value = [("b1", 0.9, {"vector_score": 0.9, "lexical_score": 0.9})]

        mock_scorer = MagicMock()
        mock_scorer_class.return_value = mock_scorer
        mock_scorer.compute_score.return_value = (0.9, {"reason": "Test"})

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [match_entity]
        mock_session.execute.return_value = mock_result

        matches = await service.screen_entity_against_list(
            entity=entity, target_risk_category="SANCTION", tenant_id="t1"
        )

        assert matches == ["b1"]
        assert service.match_tracker.record_match.called
