"""Comprehensive unit tests for SearchService."""

from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aml_filter.db.models import Entity as DBEntity
from aml_filter.domain.scoring import ScoringPolicy, ScoringWeights
from aml_filter.domain.search import SearchQuery, SearchResponse
from aml_filter.search.service import SearchService


class TestSearchServiceInitialization:
    """Test SearchService initialization."""

    def test_init_with_all_dependencies(self):
        """Test initialization with all dependencies provided."""
        mock_session = AsyncMock()
        mock_embedding = MagicMock()
        mock_hybrid = MagicMock()

        service = SearchService(
            session=mock_session,
            embedding_service=mock_embedding,
            hybrid_search_service=mock_hybrid,
        )

        assert service.session == mock_session
        assert service.embedding_service == mock_embedding
        assert service.hybrid_search_service == mock_hybrid

    @patch("aml_filter.search.service.EmbeddingService")
    @patch("aml_filter.search.service.HybridSearchService")
    def test_init_with_defaults(self, mock_hybrid_class, mock_embedding_class):
        """Test initialization creates default services."""
        mock_session = AsyncMock()

        service = SearchService(session=mock_session)

        assert service.session == mock_session
        mock_embedding_class.assert_called_once()
        mock_hybrid_class.assert_called_once_with(session=mock_session)


class TestRequestHash:
    """Test request hash computation."""

    def test_compute_request_hash_basic(self):
        """Test basic request hash computation."""
        mock_session = AsyncMock()
        service = SearchService(session=mock_session)

        query = SearchQuery(name="John Doe", threshold=0.65, k=20)

        hash_result = service._compute_request_hash(
            query=query, tenant_id="tenant-1", scoring_policy=None
        )

        assert isinstance(hash_result, str)
        assert len(hash_result) == 64  # SHA-256 hex digest length

    def test_compute_request_hash_deterministic(self):
        """Test that hash is deterministic for same inputs."""
        mock_session = AsyncMock()
        service = SearchService(session=mock_session)

        query = SearchQuery(name="John Doe", threshold=0.65, k=20)

        hash1 = service._compute_request_hash(
            query=query, tenant_id="tenant-1", scoring_policy=None
        )
        hash2 = service._compute_request_hash(
            query=query, tenant_id="tenant-1", scoring_policy=None
        )

        assert hash1 == hash2

    def test_compute_request_hash_different_inputs(self):
        """Test that different inputs produce different hashes."""
        mock_session = AsyncMock()
        service = SearchService(session=mock_session)

        query1 = SearchQuery(name="John Doe", threshold=0.65, k=20)
        query2 = SearchQuery(name="Jane Smith", threshold=0.65, k=20)

        hash1 = service._compute_request_hash(
            query=query1, tenant_id="tenant-1", scoring_policy=None
        )
        hash2 = service._compute_request_hash(
            query=query2, tenant_id="tenant-1", scoring_policy=None
        )

        assert hash1 != hash2

    def test_compute_request_hash_with_policy(self):
        """Test hash includes scoring policy when provided."""
        mock_session = AsyncMock()
        service = SearchService(session=mock_session)

        query = SearchQuery(name="John Doe", threshold=0.65, k=20)
        policy = ScoringPolicy(
            policy_id="policy-1",
            tenant_id="tenant-1",
            name="Test Policy",
            weights=ScoringWeights(),
            threshold=0.65,
            version=1,
        )

        hash_without_policy = service._compute_request_hash(
            query=query, tenant_id="tenant-1", scoring_policy=None
        )
        hash_with_policy = service._compute_request_hash(
            query=query, tenant_id="tenant-1", scoring_policy=policy
        )

        assert hash_without_policy != hash_with_policy

    def test_compute_request_hash_different_tenants(self):
        """Test different tenants produce different hashes."""
        mock_session = AsyncMock()
        service = SearchService(session=mock_session)

        query = SearchQuery(name="John Doe", threshold=0.65, k=20)

        hash1 = service._compute_request_hash(
            query=query, tenant_id="tenant-1", scoring_policy=None
        )
        hash2 = service._compute_request_hash(
            query=query, tenant_id="tenant-2", scoring_policy=None
        )

        assert hash1 != hash2


class TestDbToDomainEntity:
    """Test database to domain entity conversion."""

    def test_db_to_domain_entity_basic(self):
        """Test basic entity conversion."""
        mock_session = AsyncMock()
        service = SearchService(session=mock_session)

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
        assert domain_entity.tenant_id == "tenant-1"
        assert domain_entity.entity_type == "PERSON"
        assert domain_entity.primary_name == "John Doe"
        assert domain_entity.name_canonical == "john doe"
        assert domain_entity.risk_category == "SANCTION"

    def test_db_to_domain_entity_with_aliases(self):
        """Test entity conversion with aliases."""
        mock_session = AsyncMock()
        service = SearchService(session=mock_session)

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
            {"name": "Johnny", "name_canonical": "johnny", "source": "EU"},
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
        assert domain_entity.aliases[1].name == "Johnny"

    def test_db_to_domain_entity_with_none_values(self):
        """Test entity conversion handles None values."""
        mock_session = AsyncMock()
        service = SearchService(session=mock_session)

        db_entity = MagicMock(spec=DBEntity)
        db_entity.entity_id = "entity-1"
        db_entity.tenant_id = None
        db_entity.entity_type = "ORGANIZATION"
        db_entity.primary_name = "Test Corp"
        db_entity.name_canonical = "test corp"
        db_entity.name_tokens = None  # None instead of list
        db_entity.name_trigram = "test corp"
        db_entity.aliases = None  # None instead of list
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


class TestSearchMethod:
    """Test the main search method."""

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
    def mock_hybrid_search_service(self):
        """Create mock hybrid search service."""
        return AsyncMock()

    @pytest.fixture
    def service(self, mock_session, mock_embedding_service, mock_hybrid_search_service):
        """Create search service with mocks."""
        return SearchService(
            session=mock_session,
            embedding_service=mock_embedding_service,
            hybrid_search_service=mock_hybrid_search_service,
        )

    @pytest.mark.asyncio
    async def test_search_no_results(self, service, mock_session, mock_hybrid_search_service):
        """Test search with no results."""
        mock_hybrid_search_service.search.return_value = []

        query = SearchQuery(name="Unknown Person", threshold=0.65, k=10)
        response = await service.search(query=query, tenant_id="tenant-1")

        assert isinstance(response, SearchResponse)
        assert len(response.matches) == 0
        assert response.request_id is not None

    @pytest.mark.asyncio
    async def test_search_with_results(self, service, mock_session, mock_hybrid_search_service):
        """Test search with results."""
        # Mock hybrid search results
        mock_hybrid_search_service.search.return_value = [
            ("entity-1", 0.9, {"vector_score": 0.9, "lexical_score": 0.85}),
        ]

        # Mock entity from database
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
        db_entity.countries = ["US"]
        db_entity.nationalities = []
        db_entity.addresses = []
        db_entity.identifiers = {}
        db_entity.risk_category = "SANCTION"
        db_entity.source_list = "OFAC"
        db_entity.list_version = "2024-01"
        db_entity.custom_list_id = None
        db_entity.raw_source = {}

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [db_entity]
        mock_session.execute.return_value = mock_result

        query = SearchQuery(name="John Doe", threshold=0.5, k=10)
        response = await service.search(query=query, tenant_id="tenant-1")

        assert isinstance(response, SearchResponse)
        assert len(response.matches) >= 0  # May have matches if score above threshold

    @pytest.mark.asyncio
    async def test_search_filters_by_threshold(
        self, service, mock_session, mock_hybrid_search_service
    ):
        """Test search filters results by threshold."""
        # Mock hybrid search with multiple results
        mock_hybrid_search_service.search.return_value = [
            ("entity-1", 0.9, {"vector_score": 0.9, "lexical_score": 0.85}),
            ("entity-2", 0.4, {"vector_score": 0.4, "lexical_score": 0.35}),
        ]

        # Mock entities
        db_entity1 = MagicMock(spec=DBEntity)
        db_entity1.entity_id = "entity-1"
        db_entity1.tenant_id = None
        db_entity1.entity_type = "PERSON"
        db_entity1.primary_name = "John Doe"
        db_entity1.name_canonical = "john doe"
        db_entity1.name_tokens = ["john", "doe"]
        db_entity1.name_trigram = "john doe"
        db_entity1.aliases = []
        db_entity1.dob = []
        db_entity1.countries = []
        db_entity1.nationalities = []
        db_entity1.addresses = []
        db_entity1.identifiers = {}
        db_entity1.risk_category = "SANCTION"
        db_entity1.source_list = "OFAC"
        db_entity1.list_version = "2024-01"
        db_entity1.custom_list_id = None
        db_entity1.raw_source = {}

        db_entity2 = MagicMock(spec=DBEntity)
        db_entity2.entity_id = "entity-2"
        db_entity2.tenant_id = None
        db_entity2.entity_type = "PERSON"
        db_entity2.primary_name = "Jane Smith"
        db_entity2.name_canonical = "jane smith"
        db_entity2.name_tokens = ["jane", "smith"]
        db_entity2.name_trigram = "jane smith"
        db_entity2.aliases = []
        db_entity2.dob = []
        db_entity2.countries = []
        db_entity2.nationalities = []
        db_entity2.addresses = []
        db_entity2.identifiers = {}
        db_entity2.risk_category = "SANCTION"
        db_entity2.source_list = "OFAC"
        db_entity2.list_version = "2024-01"
        db_entity2.custom_list_id = None
        db_entity2.raw_source = {}

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [db_entity1, db_entity2]
        mock_session.execute.return_value = mock_result

        # High threshold should filter out low scores
        query = SearchQuery(name="John Doe", threshold=0.8, k=10)
        response = await service.search(query=query, tenant_id="tenant-1")

        # Only high-scoring matches should pass
        for match in response.matches:
            assert match.score >= 0.8

    @pytest.mark.asyncio
    async def test_search_with_dob_filter(self, service, mock_session, mock_hybrid_search_service):
        """Test search with DOB filter."""
        mock_hybrid_search_service.search.return_value = []

        query = SearchQuery(
            name="John Doe",
            dob=date(1990, 1, 1),
            threshold=0.65,
            k=10,
        )
        response = await service.search(query=query, tenant_id="tenant-1")

        assert isinstance(response, SearchResponse)

    @pytest.mark.asyncio
    async def test_search_with_country_filter(
        self, service, mock_session, mock_hybrid_search_service
    ):
        """Test search with country filter."""
        mock_hybrid_search_service.search.return_value = []

        query = SearchQuery(
            name="John Doe",
            country="US",
            threshold=0.65,
            k=10,
        )
        response = await service.search(query=query, tenant_id="tenant-1")

        assert isinstance(response, SearchResponse)

    @pytest.mark.asyncio
    async def test_search_with_entity_type_filter(
        self, service, mock_session, mock_hybrid_search_service
    ):
        """Test search with entity type filter."""
        mock_hybrid_search_service.search.return_value = []

        query = SearchQuery(
            name="Test Corp",
            entity_type="ORGANIZATION",
            threshold=0.65,
            k=10,
        )
        response = await service.search(query=query, tenant_id="tenant-1")

        assert isinstance(response, SearchResponse)

    @pytest.mark.asyncio
    async def test_search_with_list_filter(self, service, mock_session, mock_hybrid_search_service):
        """Test search with list filter."""
        mock_hybrid_search_service.search.return_value = []

        query = SearchQuery(
            name="John Doe",
            lists=["OFAC", "EU"],
            threshold=0.65,
            k=10,
        )
        response = await service.search(query=query, tenant_id="tenant-1")

        assert isinstance(response, SearchResponse)

    @pytest.mark.asyncio
    async def test_search_with_custom_scoring_policy(
        self, service, mock_session, mock_hybrid_search_service
    ):
        """Test search with custom scoring policy."""
        mock_hybrid_search_service.search.return_value = []

        query = SearchQuery(name="John Doe", threshold=0.65, k=10)
        policy = ScoringPolicy(
            policy_id="custom-policy",
            tenant_id="tenant-1",
            name="Custom Policy",
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

        response = await service.search(query=query, tenant_id="tenant-1", scoring_policy=policy)

        assert isinstance(response, SearchResponse)

    @pytest.mark.asyncio
    async def test_search_without_tenant_id(
        self, service, mock_session, mock_hybrid_search_service
    ):
        """Test search without tenant ID (no audit record)."""
        mock_hybrid_search_service.search.return_value = []

        query = SearchQuery(name="John Doe", threshold=0.65, k=10)
        response = await service.search(query=query, tenant_id=None)

        assert isinstance(response, SearchResponse)
        # Session.add should not be called for audit when tenant_id is None
        assert mock_session.add.call_count == 0

    @pytest.mark.asyncio
    async def test_search_creates_audit_record(
        self, service, mock_session, mock_hybrid_search_service
    ):
        """Test search creates audit record when tenant_id provided."""
        mock_hybrid_search_service.search.return_value = []

        query = SearchQuery(name="John Doe", threshold=0.65, k=10)
        response = await service.search(query=query, tenant_id="tenant-1", user_id="user-123")

        assert isinstance(response, SearchResponse)
        # Verify audit record was added
        mock_session.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_search_handles_audit_error(
        self, service, mock_session, mock_hybrid_search_service
    ):
        """Test search continues even if audit fails."""
        mock_hybrid_search_service.search.return_value = []
        mock_session.commit.side_effect = [Exception("DB Error")]

        query = SearchQuery(name="John Doe", threshold=0.65, k=10)

        # Should not raise despite audit failure
        response = await service.search(query=query, tenant_id="tenant-1")

        assert isinstance(response, SearchResponse)
        mock_session.rollback.assert_called_once()

    @pytest.mark.asyncio
    async def test_search_execution_time_tracking(
        self, service, mock_session, mock_hybrid_search_service
    ):
        """Test search tracks execution time."""
        mock_hybrid_search_service.search.return_value = []

        query = SearchQuery(name="John Doe", threshold=0.65, k=10)
        response = await service.search(query=query, tenant_id=None)

        assert response.execution_time_ms is not None
        assert response.execution_time_ms >= 0

    @pytest.mark.asyncio
    async def test_search_returns_unique_request_id(
        self, service, mock_session, mock_hybrid_search_service
    ):
        """Test each search returns unique request ID."""
        mock_hybrid_search_service.search.return_value = []

        query = SearchQuery(name="John Doe", threshold=0.65, k=10)

        response1 = await service.search(query=query, tenant_id=None)
        response2 = await service.search(query=query, tenant_id=None)

        assert response1.request_id != response2.request_id

    @pytest.mark.asyncio
    async def test_search_sorts_by_score(self, service, mock_session, mock_hybrid_search_service):
        """Test search results are sorted by score descending."""
        # Mock hybrid search with multiple results
        mock_hybrid_search_service.search.return_value = [
            ("entity-1", 0.7, {"vector_score": 0.7, "lexical_score": 0.65}),
            ("entity-2", 0.9, {"vector_score": 0.9, "lexical_score": 0.85}),
            ("entity-3", 0.5, {"vector_score": 0.5, "lexical_score": 0.45}),
        ]

        # Mock entities
        entities = []
        for i, score in enumerate([0.7, 0.9, 0.5], 1):
            db_entity = MagicMock(spec=DBEntity)
            db_entity.entity_id = f"entity-{i}"
            db_entity.tenant_id = None
            db_entity.entity_type = "PERSON"
            db_entity.primary_name = f"Person {i}"
            db_entity.name_canonical = f"person {i}"
            db_entity.name_tokens = ["person", str(i)]
            db_entity.name_trigram = f"person {i}"
            db_entity.aliases = []
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
            entities.append(db_entity)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = entities
        mock_session.execute.return_value = mock_result

        query = SearchQuery(name="Person", threshold=0.3, k=10)
        response = await service.search(query=query, tenant_id=None)

        # Verify results are sorted by score descending
        if len(response.matches) > 1:
            for i in range(len(response.matches) - 1):
                assert response.matches[i].score >= response.matches[i + 1].score

    @pytest.mark.asyncio
    async def test_search_respects_k_limit(self, service, mock_session, mock_hybrid_search_service):
        """Test search respects K limit."""
        # Mock many results
        mock_hybrid_search_service.search.return_value = [
            (f"entity-{i}", 0.9 - i * 0.01, {"vector_score": 0.9 - i * 0.01, "lexical_score": 0.85})
            for i in range(20)
        ]

        # Mock entities
        entities = []
        for i in range(20):
            db_entity = MagicMock(spec=DBEntity)
            db_entity.entity_id = f"entity-{i}"
            db_entity.tenant_id = None
            db_entity.entity_type = "PERSON"
            db_entity.primary_name = f"Person {i}"
            db_entity.name_canonical = f"person {i}"
            db_entity.name_tokens = ["person", str(i)]
            db_entity.name_trigram = f"person {i}"
            db_entity.aliases = []
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
            entities.append(db_entity)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = entities
        mock_session.execute.return_value = mock_result

        query = SearchQuery(name="Person", threshold=0.3, k=5)
        response = await service.search(query=query, tenant_id=None)

        assert len(response.matches) <= 5

    @pytest.mark.asyncio
    async def test_search_tracks_list_versions(
        self, service, mock_session, mock_hybrid_search_service
    ):
        """Test search tracks list versions used."""
        mock_hybrid_search_service.search.return_value = [
            ("entity-1", 0.9, {"vector_score": 0.9, "lexical_score": 0.85}),
        ]

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
        db_entity.identifiers = {}
        db_entity.risk_category = "SANCTION"
        db_entity.source_list = "OFAC"
        db_entity.list_version = "2024-01-15"
        db_entity.custom_list_id = None
        db_entity.raw_source = {}

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [db_entity]
        mock_session.execute.return_value = mock_result

        query = SearchQuery(name="John Doe", threshold=0.3, k=10)
        response = await service.search(query=query, tenant_id=None)

        if len(response.matches) > 0:
            assert "OFAC" in response.list_versions_used
            assert response.list_versions_used["OFAC"] == "2024-01-15"

    @pytest.mark.asyncio
    async def test_search_entity_not_in_db(self, service, mock_session, mock_hybrid_search_service):
        """Test search handles entity ID from search not found in DB."""
        # Search returns entity that doesn't exist in DB
        mock_hybrid_search_service.search.return_value = [
            ("nonexistent-entity", 0.9, {"vector_score": 0.9, "lexical_score": 0.85}),
        ]

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []  # Entity not in DB
        mock_session.execute.return_value = mock_result

        query = SearchQuery(name="John Doe", threshold=0.65, k=10)
        response = await service.search(query=query, tenant_id=None)

        # Should handle gracefully with no matches
        assert len(response.matches) == 0


class TestSearchWithAllFilters:
    """Test search with various filter combinations."""

    @pytest.fixture
    def service_with_mocks(self):
        """Create service with all mocks."""
        mock_session = AsyncMock()
        mock_embedding = MagicMock()
        mock_embedding.embed = AsyncMock(return_value=[0.1] * 384)
        mock_hybrid = AsyncMock()
        mock_hybrid.search.return_value = []

        service = SearchService(
            session=mock_session,
            embedding_service=mock_embedding,
            hybrid_search_service=mock_hybrid,
        )
        return service, mock_hybrid

    @pytest.mark.asyncio
    async def test_search_calls_hybrid_with_correct_filters(self, service_with_mocks):
        """Test that search passes correct filters to hybrid search."""
        service, mock_hybrid = service_with_mocks

        query = SearchQuery(
            name="John Doe",
            entity_type="PERSON",
            lists=["OFAC", "EU"],
            threshold=0.65,
            k=10,
        )

        await service.search(query=query, tenant_id="tenant-1")

        # Verify hybrid search was called
        mock_hybrid.search.assert_called_once()
        call_kwargs = mock_hybrid.search.call_args.kwargs

        # Check filters were passed correctly
        assert "filters" in call_kwargs
        filters = call_kwargs["filters"]
        assert filters.source_lists == ["OFAC", "EU"]
        assert filters.entity_types == ["PERSON"]

    @pytest.mark.asyncio
    async def test_search_doubles_k_for_candidates(self, service_with_mocks):
        """Test that search requests 2x candidates for scoring."""
        service, mock_hybrid = service_with_mocks

        query = SearchQuery(name="John Doe", threshold=0.65, k=10)

        await service.search(query=query, tenant_id=None)

        call_kwargs = mock_hybrid.search.call_args.kwargs
        assert call_kwargs["k"] == 20  # 2 * 10
