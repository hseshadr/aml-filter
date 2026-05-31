"""Extended unit tests for BidirectionalScreeningService - comprehensive coverage."""

from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import Tenant
from aml_filter.domain.search import CandidateScores
from aml_filter.screening.bidirectional import BidirectionalScreeningService


class TestBidirectionalScreeningServiceInit:
    """Test BidirectionalScreeningService initialization."""

    def test_init_with_all_dependencies(self):
        """Test initialization with all dependencies provided."""
        mock_session = AsyncMock()
        mock_search = MagicMock()
        mock_tracker = MagicMock()
        mock_embedding = MagicMock()

        service = BidirectionalScreeningService(
            session=mock_session,
            search_service=mock_search,
            match_tracker=mock_tracker,
            embedding_service=mock_embedding,
        )

        assert service.session == mock_session
        assert service.search_service == mock_search
        assert service.match_tracker == mock_tracker
        assert service.embedding_service == mock_embedding

    @patch("aml_filter.screening.bidirectional.SearchService")
    @patch("aml_filter.screening.bidirectional.MatchTracker")
    @patch("aml_filter.screening.bidirectional.EmbeddingService")
    def test_init_creates_defaults(self, mock_embed, mock_tracker, mock_search):
        """Test initialization creates default services."""
        mock_session = AsyncMock()

        service = BidirectionalScreeningService(session=mock_session)

        mock_search.assert_called_once_with(session=mock_session)
        mock_tracker.assert_called_once_with(session=mock_session)
        mock_embed.assert_called_once()


class TestDbToDomainEntity:
    """Test database to domain entity conversion."""

    @pytest.fixture
    def service(self):
        """Create service with mocks."""
        mock_session = AsyncMock()
        mock_search = MagicMock()
        mock_tracker = MagicMock()
        mock_embedding = MagicMock()
        return BidirectionalScreeningService(
            session=mock_session,
            search_service=mock_search,
            match_tracker=mock_tracker,
            embedding_service=mock_embedding,
        )

    def test_convert_basic_entity(self, service):
        """Test converting basic DB entity to domain entity."""
        db_entity = MagicMock(spec=DBEntity)
        db_entity.entity_id = "entity-1"
        db_entity.tenant_id = "tenant-1"
        db_entity.entity_type = "PERSON"
        db_entity.primary_name = "John Doe"
        db_entity.name_canonical = "john doe"
        db_entity.name_tokens = ["john", "doe"]
        db_entity.name_trigram = "john doe"
        db_entity.aliases = []
        db_entity.dob = [date(1990, 1, 1)]
        db_entity.countries = ["US"]
        db_entity.nationalities = ["American"]
        db_entity.addresses = ["123 Main St"]
        db_entity.identifiers = {}
        db_entity.risk_category = "SANCTION"
        db_entity.source_list = "OFAC"
        db_entity.list_version = "2024-01"
        db_entity.custom_list_id = None
        db_entity.raw_source = {}

        domain_entity = service._db_to_domain_entity(db_entity)

        assert domain_entity.entity_id == "entity-1"
        assert domain_entity.entity_type == "PERSON"
        assert domain_entity.primary_name == "John Doe"
        assert domain_entity.dob == [date(1990, 1, 1)]
        assert domain_entity.countries == ["US"]

    def test_convert_entity_with_aliases(self, service):
        """Test converting entity with aliases."""
        db_entity = MagicMock(spec=DBEntity)
        db_entity.entity_id = "entity-1"
        db_entity.tenant_id = None
        db_entity.entity_type = "PERSON"
        db_entity.primary_name = "John Doe"
        db_entity.name_canonical = "john doe"
        db_entity.name_tokens = ["john", "doe"]
        db_entity.name_trigram = "john doe"
        db_entity.aliases = [
            {"name": "J. Doe", "name_canonical": "j. doe", "source": "OFAC"},
            {"name": "Johnny D", "name_canonical": "johnny d", "source": "EU"},
        ]
        db_entity.dob = []
        db_entity.countries = []
        db_entity.nationalities = []
        db_entity.addresses = []
        db_entity.identifiers = {}
        db_entity.risk_category = "SANCTION"
        db_entity.source_list = "OFAC"
        db_entity.list_version = "2024-01"
        db_entity.custom_list_id = None
        db_entity.raw_source = {}

        domain_entity = service._db_to_domain_entity(db_entity)

        assert len(domain_entity.aliases) == 2
        assert domain_entity.aliases[0].name == "J. Doe"
        assert domain_entity.aliases[1].source == "EU"

    def test_convert_entity_with_identifiers(self, service):
        """Test converting entity with identifiers."""
        db_entity = MagicMock(spec=DBEntity)
        db_entity.entity_id = "entity-1"
        db_entity.tenant_id = None
        db_entity.entity_type = "PERSON"
        db_entity.primary_name = "John Doe"
        db_entity.name_canonical = "john doe"
        db_entity.name_tokens = ["john", "doe"]
        db_entity.name_trigram = "john doe"
        db_entity.aliases = []
        db_entity.dob = []
        db_entity.countries = []
        db_entity.nationalities = []
        db_entity.addresses = []
        db_entity.identifiers = {
            "passport": ["AB123456", "CD789012"],
            "national_id": ["SSN-123"],
            "other": {"driver_license": ["DL-456"]},
        }
        db_entity.risk_category = "SANCTION"
        db_entity.source_list = "OFAC"
        db_entity.list_version = "2024-01"
        db_entity.custom_list_id = None
        db_entity.raw_source = {}

        domain_entity = service._db_to_domain_entity(db_entity)

        assert domain_entity.identifiers.passport == ["AB123456", "CD789012"]
        assert domain_entity.identifiers.national_id == ["SSN-123"]
        assert domain_entity.identifiers.other == {"driver_license": ["DL-456"]}

    def test_convert_entity_with_none_values(self, service):
        """Test converting entity handles None values."""
        db_entity = MagicMock(spec=DBEntity)
        db_entity.entity_id = "entity-1"
        db_entity.tenant_id = None
        db_entity.entity_type = "ORGANIZATION"
        db_entity.primary_name = "Test Corp"
        db_entity.name_canonical = "test corp"
        db_entity.name_tokens = None
        db_entity.name_trigram = "test corp"
        db_entity.aliases = None
        db_entity.dob = None
        db_entity.countries = None
        db_entity.nationalities = None
        db_entity.addresses = None
        db_entity.identifiers = None
        db_entity.risk_category = "SANCTION"
        db_entity.source_list = "OFAC"
        db_entity.list_version = "2024-01"
        db_entity.custom_list_id = None
        db_entity.raw_source = None

        domain_entity = service._db_to_domain_entity(db_entity)

        assert domain_entity.name_tokens == []
        assert domain_entity.aliases == []
        assert domain_entity.dob == []
        assert domain_entity.countries == []


class TestScreenWhitelistAgainstBlacklist:
    """Test screen_whitelist_against_blacklist method."""

    @pytest.fixture
    def mock_session(self):
        """Create mock session."""
        return AsyncMock()

    @pytest.fixture
    def service(self, mock_session):
        """Create service with mocks."""
        mock_search = MagicMock()
        mock_tracker = AsyncMock()
        mock_embedding = MagicMock()
        mock_embedding.embed = AsyncMock(return_value=[0.1] * 384)

        return BidirectionalScreeningService(
            session=mock_session,
            search_service=mock_search,
            match_tracker=mock_tracker,
            embedding_service=mock_embedding,
        )

    @pytest.mark.asyncio
    async def test_no_whitelist_entities(self, service, mock_session):
        """Test screening with no whitelist entities."""
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_session.execute.return_value = mock_result

        result = await service.screen_whitelist_against_blacklist(
            tenant_id="tenant-1",
            threshold=0.65,
        )

        assert result["entities_scanned"] == 0
        assert result["matches_found"] == 0

    @pytest.mark.asyncio
    async def test_whitelist_entities_no_matches(self, service, mock_session):
        """Test screening whitelist entities with no matches."""
        # Mock whitelist entity
        whitelist_entity = MagicMock(spec=DBEntity)
        whitelist_entity.entity_id = "w1"
        whitelist_entity.tenant_id = "tenant-1"
        whitelist_entity.entity_type = "PERSON"
        whitelist_entity.primary_name = "Good Customer"
        whitelist_entity.name_canonical = "good customer"
        whitelist_entity.name_tokens = ["good", "customer"]
        whitelist_entity.name_trigram = "good customer"
        whitelist_entity.risk_category = "WHITELIST"
        whitelist_entity.source_list = "WHITELIST"
        whitelist_entity.list_version = "v1"
        whitelist_entity.custom_list_id = None
        whitelist_entity.countries = []
        whitelist_entity.nationalities = []
        whitelist_entity.addresses = []
        whitelist_entity.dob = []
        whitelist_entity.aliases = []
        whitelist_entity.identifiers = {}
        whitelist_entity.raw_source = {}

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [whitelist_entity]
        mock_session.execute.return_value = mock_result

        with patch.object(
            service, "screen_entity_against_list", new_callable=AsyncMock
        ) as mock_screen:
            mock_screen.return_value = []

            result = await service.screen_whitelist_against_blacklist(
                tenant_id="tenant-1",
                threshold=0.65,
            )

            assert result["entities_scanned"] == 1
            assert result["matches_found"] == 0

    @pytest.mark.asyncio
    async def test_whitelist_entities_with_matches(self, service, mock_session):
        """Test screening whitelist entities with matches."""
        # Mock whitelist entities
        entities = []
        for i in range(3):
            entity = MagicMock(spec=DBEntity)
            entity.entity_id = f"w{i}"
            entity.tenant_id = "tenant-1"
            entity.entity_type = "PERSON"
            entity.primary_name = f"Customer {i}"
            entity.name_canonical = f"customer {i}"
            entity.name_tokens = ["customer", str(i)]
            entity.name_trigram = f"customer {i}"
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
            entities.append(entity)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = entities
        mock_session.execute.return_value = mock_result

        with patch.object(
            service, "screen_entity_against_list", new_callable=AsyncMock
        ) as mock_screen:
            # First entity has 2 matches, second has 1, third has 0
            mock_screen.side_effect = [["b1", "b2"], ["b3"], []]

            result = await service.screen_whitelist_against_blacklist(
                tenant_id="tenant-1",
                threshold=0.65,
            )

            assert result["entities_scanned"] == 3
            assert result["matches_found"] == 3

    @pytest.mark.asyncio
    async def test_with_list_id_filter(self, service, mock_session):
        """Test screening with specific list ID filter."""
        whitelist_entity = MagicMock(spec=DBEntity)
        whitelist_entity.entity_id = "w1"
        whitelist_entity.tenant_id = "tenant-1"
        whitelist_entity.entity_type = "PERSON"
        whitelist_entity.primary_name = "Customer"
        whitelist_entity.name_canonical = "customer"
        whitelist_entity.name_tokens = ["customer"]
        whitelist_entity.name_trigram = "customer"
        whitelist_entity.risk_category = "WHITELIST"
        whitelist_entity.source_list = "WHITELIST"
        whitelist_entity.list_version = "v1"
        whitelist_entity.custom_list_id = None
        whitelist_entity.countries = []
        whitelist_entity.nationalities = []
        whitelist_entity.addresses = []
        whitelist_entity.dob = []
        whitelist_entity.aliases = []
        whitelist_entity.identifiers = {}
        whitelist_entity.raw_source = {}

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [whitelist_entity]
        mock_session.execute.return_value = mock_result

        with patch.object(
            service, "screen_entity_against_list", new_callable=AsyncMock
        ) as mock_screen:
            mock_screen.return_value = ["b1"]

            result = await service.screen_whitelist_against_blacklist(
                tenant_id="tenant-1",
                list_id="OFAC_SDN",
                list_version="2024-01",
                threshold=0.70,
            )

            # Verify correct parameters passed
            mock_screen.assert_called_once()
            call_kwargs = mock_screen.call_args.kwargs
            assert call_kwargs["list_id"] == "OFAC_SDN"
            assert call_kwargs["list_version"] == "2024-01"
            assert call_kwargs["threshold"] == 0.70

    @pytest.mark.asyncio
    async def test_batching(self, service, mock_session):
        """Test that entities are processed in batches."""
        # Create 250 entities to test batching
        entities = []
        for i in range(250):
            entity = MagicMock(spec=DBEntity)
            entity.entity_id = f"w{i}"
            entity.tenant_id = "tenant-1"
            entity.entity_type = "PERSON"
            entity.primary_name = f"Customer {i}"
            entity.name_canonical = f"customer {i}"
            entity.name_tokens = ["customer", str(i)]
            entity.name_trigram = f"customer {i}"
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
            entities.append(entity)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = entities
        mock_session.execute.return_value = mock_result

        with patch.object(
            service, "screen_entity_against_list", new_callable=AsyncMock
        ) as mock_screen:
            mock_screen.return_value = []

            result = await service.screen_whitelist_against_blacklist(
                tenant_id="tenant-1",
                batch_size=100,
            )

            assert result["entities_scanned"] == 250
            assert mock_screen.call_count == 250


class TestScreenBlacklistAgainstWhitelist:
    """Test screen_blacklist_against_whitelist method."""

    @pytest.fixture
    def mock_session(self):
        """Create mock session."""
        return AsyncMock()

    @pytest.fixture
    def service(self, mock_session):
        """Create service with mocks."""
        mock_search = MagicMock()
        mock_tracker = AsyncMock()
        mock_embedding = MagicMock()
        mock_embedding.embed = AsyncMock(return_value=[0.1] * 384)

        return BidirectionalScreeningService(
            session=mock_session,
            search_service=mock_search,
            match_tracker=mock_tracker,
            embedding_service=mock_embedding,
        )

    @pytest.mark.asyncio
    async def test_no_blacklist_entities(self, service, mock_session):
        """Test screening with no blacklist entities."""
        # First query returns no blacklist entities
        # Second query returns tenants
        mock_result1 = MagicMock()
        mock_result1.scalars.return_value.all.return_value = []

        mock_result2 = MagicMock()
        mock_result2.scalars.return_value.all.return_value = []

        mock_session.execute.side_effect = [mock_result1, mock_result2]

        result = await service.screen_blacklist_against_whitelist(threshold=0.65)

        assert result["entities_scanned"] == 0
        assert result["matches_found"] == 0

    @pytest.mark.asyncio
    async def test_no_tenants(self, service, mock_session):
        """Test screening with blacklist entities but no tenants."""
        blacklist_entity = MagicMock(spec=DBEntity)
        blacklist_entity.entity_id = "b1"
        blacklist_entity.tenant_id = None
        blacklist_entity.entity_type = "PERSON"
        blacklist_entity.primary_name = "Bad Guy"
        blacklist_entity.name_canonical = "bad guy"
        blacklist_entity.name_tokens = ["bad", "guy"]
        blacklist_entity.name_trigram = "bad guy"
        blacklist_entity.risk_category = "SANCTION"
        blacklist_entity.source_list = "OFAC"
        blacklist_entity.list_version = "v1"
        blacklist_entity.custom_list_id = None
        blacklist_entity.countries = []
        blacklist_entity.nationalities = []
        blacklist_entity.addresses = []
        blacklist_entity.dob = []
        blacklist_entity.aliases = []
        blacklist_entity.identifiers = {}
        blacklist_entity.raw_source = {}

        mock_result1 = MagicMock()
        mock_result1.scalars.return_value.all.return_value = [blacklist_entity]

        mock_result2 = MagicMock()
        mock_result2.scalars.return_value.all.return_value = []  # No tenants

        mock_session.execute.side_effect = [mock_result1, mock_result2]

        result = await service.screen_blacklist_against_whitelist(threshold=0.65)

        # No tenants means no screening happens
        assert result["entities_scanned"] == 0
        assert result["matches_found"] == 0

    @pytest.mark.asyncio
    async def test_with_tenants_and_matches(self, service, mock_session):
        """Test screening blacklist against multiple tenant whitelists."""
        blacklist_entity = MagicMock(spec=DBEntity)
        blacklist_entity.entity_id = "b1"
        blacklist_entity.tenant_id = None
        blacklist_entity.entity_type = "PERSON"
        blacklist_entity.primary_name = "Bad Guy"
        blacklist_entity.name_canonical = "bad guy"
        blacklist_entity.name_tokens = ["bad", "guy"]
        blacklist_entity.name_trigram = "bad guy"
        blacklist_entity.risk_category = "SANCTION"
        blacklist_entity.source_list = "OFAC"
        blacklist_entity.list_version = "v1"
        blacklist_entity.custom_list_id = None
        blacklist_entity.countries = []
        blacklist_entity.nationalities = []
        blacklist_entity.addresses = []
        blacklist_entity.dob = []
        blacklist_entity.aliases = []
        blacklist_entity.identifiers = {}
        blacklist_entity.raw_source = {}

        tenant1 = MagicMock(spec=Tenant)
        tenant1.tenant_id = "t1"
        tenant2 = MagicMock(spec=Tenant)
        tenant2.tenant_id = "t2"

        mock_result1 = MagicMock()
        mock_result1.scalars.return_value.all.return_value = [blacklist_entity]

        mock_result2 = MagicMock()
        mock_result2.scalars.return_value.all.return_value = [tenant1, tenant2]

        mock_session.execute.side_effect = [mock_result1, mock_result2]

        with patch.object(
            service, "screen_entity_against_list", new_callable=AsyncMock
        ) as mock_screen:
            # Match in tenant1, no match in tenant2
            mock_screen.side_effect = [["w1"], []]

            result = await service.screen_blacklist_against_whitelist(threshold=0.65)

            assert result["entities_scanned"] == 2  # 1 entity x 2 tenants
            assert result["matches_found"] == 1

    @pytest.mark.asyncio
    async def test_with_list_filter(self, service, mock_session):
        """Test screening with list ID and version filters."""
        blacklist_entity = MagicMock(spec=DBEntity)
        blacklist_entity.entity_id = "b1"
        blacklist_entity.tenant_id = None
        blacklist_entity.entity_type = "PERSON"
        blacklist_entity.primary_name = "Bad Guy"
        blacklist_entity.name_canonical = "bad guy"
        blacklist_entity.name_tokens = ["bad", "guy"]
        blacklist_entity.name_trigram = "bad guy"
        blacklist_entity.risk_category = "SANCTION"
        blacklist_entity.source_list = "EU"
        blacklist_entity.list_version = "2024-06"
        blacklist_entity.custom_list_id = None
        blacklist_entity.countries = []
        blacklist_entity.nationalities = []
        blacklist_entity.addresses = []
        blacklist_entity.dob = []
        blacklist_entity.aliases = []
        blacklist_entity.identifiers = {}
        blacklist_entity.raw_source = {}

        tenant = MagicMock(spec=Tenant)
        tenant.tenant_id = "t1"

        mock_result1 = MagicMock()
        mock_result1.scalars.return_value.all.return_value = [blacklist_entity]

        mock_result2 = MagicMock()
        mock_result2.scalars.return_value.all.return_value = [tenant]

        mock_session.execute.side_effect = [mock_result1, mock_result2]

        with patch.object(
            service, "screen_entity_against_list", new_callable=AsyncMock
        ) as mock_screen:
            mock_screen.return_value = []

            await service.screen_blacklist_against_whitelist(
                list_id="EU",
                list_version="2024-06",
            )

            # Verify SQL query filters are applied (implicitly through execute calls)
            assert mock_session.execute.call_count == 2


class TestScreenEntityAgainstList:
    """Test screen_entity_against_list method."""

    @pytest.fixture
    def mock_session(self):
        """Create mock session."""
        return AsyncMock()

    @pytest.fixture
    def mock_embedding_service(self):
        """Create mock embedding service."""
        service = MagicMock()
        service.embed = AsyncMock(return_value=[0.1] * 384)
        return service

    @pytest.fixture
    def service(self, mock_session, mock_embedding_service):
        """Create service with mocks."""
        mock_search = MagicMock()
        mock_tracker = AsyncMock()

        return BidirectionalScreeningService(
            session=mock_session,
            search_service=mock_search,
            match_tracker=mock_tracker,
            embedding_service=mock_embedding_service,
        )

    @pytest.fixture
    def whitelist_entity(self):
        """Create a whitelist entity."""
        entity = MagicMock(spec=DBEntity)
        entity.entity_id = "w1"
        entity.tenant_id = "tenant-1"
        entity.entity_type = "PERSON"
        entity.primary_name = "John Customer"
        entity.name_canonical = "john customer"
        entity.name_tokens = ["john", "customer"]
        entity.name_trigram = "john customer"
        entity.risk_category = "WHITELIST"
        entity.source_list = "WHITELIST"
        entity.list_version = "v1"
        entity.custom_list_id = None
        entity.countries = ["US"]
        entity.nationalities = []
        entity.addresses = []
        entity.dob = [date(1980, 1, 1)]
        entity.aliases = []
        entity.identifiers = {}
        entity.raw_source = {}
        return entity

    @pytest.mark.asyncio
    async def test_no_search_results(self, service, mock_session, whitelist_entity):
        """Test screening with no search results."""
        with patch("aml_filter.screening.bidirectional.HybridSearchService") as mock_hybrid_class:
            mock_hybrid = AsyncMock()
            mock_hybrid_class.return_value = mock_hybrid
            mock_hybrid.search.return_value = []

            matches = await service.screen_entity_against_list(
                entity=whitelist_entity,
                target_risk_category="SANCTION",
                tenant_id="tenant-1",
            )

            assert matches == []

    @pytest.mark.asyncio
    async def test_with_matches_above_threshold(self, service, mock_session, whitelist_entity):
        """Test screening returns matches above threshold."""
        # Mock the matched entity from database
        match_entity = MagicMock(spec=DBEntity)
        match_entity.entity_id = "b1"
        match_entity.tenant_id = None
        match_entity.entity_type = "PERSON"
        match_entity.primary_name = "John Customer"
        match_entity.name_canonical = "john customer"
        match_entity.name_tokens = ["john", "customer"]
        match_entity.name_trigram = "john customer"
        match_entity.risk_category = "SANCTION"
        match_entity.source_list = "OFAC"
        match_entity.list_version = "2024-01"
        match_entity.custom_list_id = None
        match_entity.countries = ["US"]
        match_entity.nationalities = []
        match_entity.addresses = []
        match_entity.dob = []
        match_entity.aliases = []
        match_entity.identifiers = {}
        match_entity.raw_source = {}

        with patch("aml_filter.screening.bidirectional.HybridSearchService") as mock_hybrid_class:
            mock_hybrid = AsyncMock()
            mock_hybrid_class.return_value = mock_hybrid
            mock_hybrid.search.return_value = [
                ("b1", 0.9, CandidateScores(vector_score=0.9, lexical_score=0.85, source="both")),
            ]

            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [match_entity]
            mock_session.execute.return_value = mock_result

            with patch(
                "aml_filter.screening.bidirectional.DefaultScoringPolicy"
            ) as mock_scorer_class:
                mock_scorer = MagicMock()
                mock_scorer_class.return_value = mock_scorer
                mock_scorer.compute_score.return_value = (0.85, {"summary": "Match"})

                matches = await service.screen_entity_against_list(
                    entity=whitelist_entity,
                    target_risk_category="SANCTION",
                    threshold=0.65,
                    tenant_id="tenant-1",
                )

                assert "b1" in matches
                assert service.match_tracker.record_match.called

    @pytest.mark.asyncio
    async def test_matches_below_threshold_filtered(self, service, mock_session, whitelist_entity):
        """Test that matches below threshold are filtered out."""
        match_entity = MagicMock(spec=DBEntity)
        match_entity.entity_id = "b1"
        match_entity.tenant_id = None
        match_entity.entity_type = "PERSON"
        match_entity.primary_name = "Different Person"
        match_entity.name_canonical = "different person"
        match_entity.name_tokens = ["different", "person"]
        match_entity.name_trigram = "different person"
        match_entity.risk_category = "SANCTION"
        match_entity.source_list = "OFAC"
        match_entity.list_version = "2024-01"
        match_entity.custom_list_id = None
        match_entity.countries = []
        match_entity.nationalities = []
        match_entity.addresses = []
        match_entity.dob = []
        match_entity.aliases = []
        match_entity.identifiers = {}
        match_entity.raw_source = {}

        with patch("aml_filter.screening.bidirectional.HybridSearchService") as mock_hybrid_class:
            mock_hybrid = AsyncMock()
            mock_hybrid_class.return_value = mock_hybrid
            mock_hybrid.search.return_value = [
                ("b1", 0.4, CandidateScores(vector_score=0.4, lexical_score=0.35, source="both")),
            ]

            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [match_entity]
            mock_session.execute.return_value = mock_result

            with patch(
                "aml_filter.screening.bidirectional.DefaultScoringPolicy"
            ) as mock_scorer_class:
                mock_scorer = MagicMock()
                mock_scorer_class.return_value = mock_scorer
                mock_scorer.compute_score.return_value = (0.35, {"summary": "Low match"})

                matches = await service.screen_entity_against_list(
                    entity=whitelist_entity,
                    target_risk_category="SANCTION",
                    threshold=0.65,
                    tenant_id="tenant-1",
                )

                assert matches == []
                assert not service.match_tracker.record_match.called

    @pytest.mark.asyncio
    async def test_screening_whitelist_requires_tenant_id(
        self, service, mock_session, whitelist_entity
    ):
        """Test that screening against WHITELIST requires tenant_id."""
        # Create a blacklist entity to screen against whitelist
        blacklist_entity = MagicMock(spec=DBEntity)
        blacklist_entity.entity_id = "b1"
        blacklist_entity.tenant_id = None
        blacklist_entity.entity_type = "PERSON"
        blacklist_entity.primary_name = "Bad Person"
        blacklist_entity.name_canonical = "bad person"
        blacklist_entity.name_tokens = ["bad", "person"]
        blacklist_entity.name_trigram = "bad person"
        blacklist_entity.risk_category = "SANCTION"
        blacklist_entity.source_list = "OFAC"
        blacklist_entity.list_version = "v1"
        blacklist_entity.custom_list_id = None
        blacklist_entity.countries = []
        blacklist_entity.nationalities = []
        blacklist_entity.addresses = []
        blacklist_entity.dob = []
        blacklist_entity.aliases = []
        blacklist_entity.identifiers = {}
        blacklist_entity.raw_source = {}

        # Screen against WHITELIST without tenant_id should return empty
        matches = await service.screen_entity_against_list(
            entity=blacklist_entity,
            target_risk_category="WHITELIST",
            tenant_id=None,  # No tenant ID
        )

        assert matches == []

    @pytest.mark.asyncio
    async def test_list_id_filter_applied(self, service, mock_session, whitelist_entity):
        """Test that list_id filter is applied to matches."""
        match_entity1 = MagicMock(spec=DBEntity)
        match_entity1.entity_id = "b1"
        match_entity1.tenant_id = None
        match_entity1.entity_type = "PERSON"
        match_entity1.primary_name = "Match Person"
        match_entity1.name_canonical = "match person"
        match_entity1.name_tokens = ["match", "person"]
        match_entity1.name_trigram = "match person"
        match_entity1.risk_category = "SANCTION"
        match_entity1.source_list = "OFAC"  # Matches filter
        match_entity1.list_version = "2024-01"
        match_entity1.custom_list_id = None
        match_entity1.countries = []
        match_entity1.nationalities = []
        match_entity1.addresses = []
        match_entity1.dob = []
        match_entity1.aliases = []
        match_entity1.identifiers = {}
        match_entity1.raw_source = {}

        match_entity2 = MagicMock(spec=DBEntity)
        match_entity2.entity_id = "b2"
        match_entity2.tenant_id = None
        match_entity2.entity_type = "PERSON"
        match_entity2.primary_name = "Other Person"
        match_entity2.name_canonical = "other person"
        match_entity2.name_tokens = ["other", "person"]
        match_entity2.name_trigram = "other person"
        match_entity2.risk_category = "SANCTION"
        match_entity2.source_list = "EU"  # Different list
        match_entity2.list_version = "2024-01"
        match_entity2.custom_list_id = None
        match_entity2.countries = []
        match_entity2.nationalities = []
        match_entity2.addresses = []
        match_entity2.dob = []
        match_entity2.aliases = []
        match_entity2.identifiers = {}
        match_entity2.raw_source = {}

        with patch("aml_filter.screening.bidirectional.HybridSearchService") as mock_hybrid_class:
            mock_hybrid = AsyncMock()
            mock_hybrid_class.return_value = mock_hybrid
            mock_hybrid.search.return_value = [
                ("b1", 0.9, CandidateScores(vector_score=0.9, lexical_score=0.85, source="both")),
                ("b2", 0.85, CandidateScores(vector_score=0.85, lexical_score=0.80, source="both")),
            ]

            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [match_entity1, match_entity2]
            mock_session.execute.return_value = mock_result

            with patch(
                "aml_filter.screening.bidirectional.DefaultScoringPolicy"
            ) as mock_scorer_class:
                mock_scorer = MagicMock()
                mock_scorer_class.return_value = mock_scorer
                mock_scorer.compute_score.return_value = (0.85, {"summary": "Match"})

                matches = await service.screen_entity_against_list(
                    entity=whitelist_entity,
                    target_risk_category="SANCTION",
                    list_id="OFAC",  # Filter to OFAC only
                    threshold=0.65,
                    tenant_id="tenant-1",
                )

                # Only OFAC match should be included
                assert "b1" in matches
                assert "b2" not in matches

    @pytest.mark.asyncio
    async def test_list_version_filter_applied(self, service, mock_session, whitelist_entity):
        """Test that list_version filter is applied to matches."""
        match_entity1 = MagicMock(spec=DBEntity)
        match_entity1.entity_id = "b1"
        match_entity1.tenant_id = None
        match_entity1.entity_type = "PERSON"
        match_entity1.primary_name = "Match Person"
        match_entity1.name_canonical = "match person"
        match_entity1.name_tokens = ["match", "person"]
        match_entity1.name_trigram = "match person"
        match_entity1.risk_category = "SANCTION"
        match_entity1.source_list = "OFAC"
        match_entity1.list_version = "2024-01"  # Matches filter
        match_entity1.custom_list_id = None
        match_entity1.countries = []
        match_entity1.nationalities = []
        match_entity1.addresses = []
        match_entity1.dob = []
        match_entity1.aliases = []
        match_entity1.identifiers = {}
        match_entity1.raw_source = {}

        match_entity2 = MagicMock(spec=DBEntity)
        match_entity2.entity_id = "b2"
        match_entity2.tenant_id = None
        match_entity2.entity_type = "PERSON"
        match_entity2.primary_name = "Other Person"
        match_entity2.name_canonical = "other person"
        match_entity2.name_tokens = ["other", "person"]
        match_entity2.name_trigram = "other person"
        match_entity2.risk_category = "SANCTION"
        match_entity2.source_list = "OFAC"
        match_entity2.list_version = "2023-12"  # Old version
        match_entity2.custom_list_id = None
        match_entity2.countries = []
        match_entity2.nationalities = []
        match_entity2.addresses = []
        match_entity2.dob = []
        match_entity2.aliases = []
        match_entity2.identifiers = {}
        match_entity2.raw_source = {}

        with patch("aml_filter.screening.bidirectional.HybridSearchService") as mock_hybrid_class:
            mock_hybrid = AsyncMock()
            mock_hybrid_class.return_value = mock_hybrid
            mock_hybrid.search.return_value = [
                ("b1", 0.9, CandidateScores(vector_score=0.9, lexical_score=0.85, source="both")),
                ("b2", 0.85, CandidateScores(vector_score=0.85, lexical_score=0.80, source="both")),
            ]

            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [match_entity1, match_entity2]
            mock_session.execute.return_value = mock_result

            with patch(
                "aml_filter.screening.bidirectional.DefaultScoringPolicy"
            ) as mock_scorer_class:
                mock_scorer = MagicMock()
                mock_scorer_class.return_value = mock_scorer
                mock_scorer.compute_score.return_value = (0.85, {"summary": "Match"})

                matches = await service.screen_entity_against_list(
                    entity=whitelist_entity,
                    target_risk_category="SANCTION",
                    list_version="2024-01",  # Filter to specific version
                    threshold=0.65,
                    tenant_id="tenant-1",
                )

                # Only matching version should be included
                assert "b1" in matches
                assert "b2" not in matches

    @pytest.mark.asyncio
    async def test_match_recording_whitelist_vs_blacklist(
        self, service, mock_session, whitelist_entity
    ):
        """Test correct match recording for whitelist vs blacklist."""
        match_entity = MagicMock(spec=DBEntity)
        match_entity.entity_id = "b1"
        match_entity.tenant_id = None
        match_entity.entity_type = "PERSON"
        match_entity.primary_name = "Match Person"
        match_entity.name_canonical = "match person"
        match_entity.name_tokens = ["match", "person"]
        match_entity.name_trigram = "match person"
        match_entity.risk_category = "SANCTION"
        match_entity.source_list = "OFAC"
        match_entity.list_version = "2024-01"
        match_entity.custom_list_id = None
        match_entity.countries = []
        match_entity.nationalities = []
        match_entity.addresses = []
        match_entity.dob = []
        match_entity.aliases = []
        match_entity.identifiers = {}
        match_entity.raw_source = {}

        with patch("aml_filter.screening.bidirectional.HybridSearchService") as mock_hybrid_class:
            mock_hybrid = AsyncMock()
            mock_hybrid_class.return_value = mock_hybrid
            mock_hybrid.search.return_value = [
                ("b1", 0.9, CandidateScores(vector_score=0.9, lexical_score=0.85, source="both")),
            ]

            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [match_entity]
            mock_session.execute.return_value = mock_result

            with patch(
                "aml_filter.screening.bidirectional.DefaultScoringPolicy"
            ) as mock_scorer_class:
                mock_scorer = MagicMock()
                mock_scorer_class.return_value = mock_scorer
                mock_scorer.compute_score.return_value = (0.85, {"summary": "Match"})

                await service.screen_entity_against_list(
                    entity=whitelist_entity,
                    target_risk_category="SANCTION",
                    threshold=0.65,
                    match_type="WHITELIST_VS_BLACKLIST",
                    tenant_id="tenant-1",
                )

                # Verify match_tracker.record_match was called with correct parameters
                service.match_tracker.record_match.assert_called_once()
                call_kwargs = service.match_tracker.record_match.call_args.kwargs
                assert call_kwargs["tenant_id"] == "tenant-1"
                assert call_kwargs["whitelist_entity_id"] == "w1"  # whitelist_entity.entity_id
                assert call_kwargs["blacklist_entity_id"] == "b1"
                assert call_kwargs["match_type"] == "WHITELIST_VS_BLACKLIST"

    @pytest.mark.asyncio
    async def test_risk_category_filter(self, service, mock_session, whitelist_entity):
        """Test that risk category filter excludes non-matching entities."""
        # Entity with wrong risk category
        pep_entity = MagicMock(spec=DBEntity)
        pep_entity.entity_id = "p1"
        pep_entity.tenant_id = None
        pep_entity.entity_type = "PERSON"
        pep_entity.primary_name = "PEP Person"
        pep_entity.name_canonical = "pep person"
        pep_entity.name_tokens = ["pep", "person"]
        pep_entity.name_trigram = "pep person"
        pep_entity.risk_category = "PEP"  # Not SANCTION
        pep_entity.source_list = "PEP_LIST"
        pep_entity.list_version = "2024-01"
        pep_entity.custom_list_id = None
        pep_entity.countries = []
        pep_entity.nationalities = []
        pep_entity.addresses = []
        pep_entity.dob = []
        pep_entity.aliases = []
        pep_entity.identifiers = {}
        pep_entity.raw_source = {}

        with patch("aml_filter.screening.bidirectional.HybridSearchService") as mock_hybrid_class:
            mock_hybrid = AsyncMock()
            mock_hybrid_class.return_value = mock_hybrid
            mock_hybrid.search.return_value = [
                ("p1", 0.9, CandidateScores(vector_score=0.9, lexical_score=0.85, source="both")),
            ]

            mock_result = MagicMock()
            mock_result.scalars.return_value.all.return_value = [pep_entity]
            mock_session.execute.return_value = mock_result

            with patch(
                "aml_filter.screening.bidirectional.DefaultScoringPolicy"
            ) as mock_scorer_class:
                mock_scorer = MagicMock()
                mock_scorer_class.return_value = mock_scorer
                mock_scorer.compute_score.return_value = (0.85, {"summary": "Match"})

                matches = await service.screen_entity_against_list(
                    entity=whitelist_entity,
                    target_risk_category="SANCTION",  # Looking for SANCTION, not PEP
                    threshold=0.65,
                    tenant_id="tenant-1",
                )

                # PEP entity should not be in matches because risk_category doesn't match
                assert "p1" not in matches
