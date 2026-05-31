"""Unit tests for hybrid search service."""

from typing import Any
from unittest.mock import AsyncMock

import pytest

from aml_filter.domain.search import SearchFilters
from aml_filter.search.hybrid_search import HybridSearchService


@pytest.fixture
def mock_session() -> AsyncMock:
    """Create a mock async session."""
    return AsyncMock()


@pytest.fixture
def mock_vector_backend() -> AsyncMock:
    """Create a mock vector backend."""
    backend = AsyncMock()
    backend.vector_search = AsyncMock()
    return backend


@pytest.fixture
def mock_lexical_backend() -> AsyncMock:
    """Create a mock lexical backend."""
    backend = AsyncMock()
    backend.combined_lexical_search = AsyncMock()
    return backend


@pytest.mark.unit
class TestHybridSearchInit:
    """Test HybridSearchService initialization."""

    async def test_hybrid_service_initialization(self, session: Any) -> None:
        """Test that hybrid search service initializes correctly."""
        service = HybridSearchService(session=session)
        assert service.session == session
        assert service.lexical_backend is not None
        assert service.vector_backend is not None

    async def test_hybrid_service_with_custom_backends(
        self,
        mock_session: AsyncMock,
        mock_vector_backend: AsyncMock,
        mock_lexical_backend: AsyncMock,
    ) -> None:
        """Test initialization with custom backends."""
        service = HybridSearchService(
            session=mock_session,
            vector_backend=mock_vector_backend,
            lexical_backend=mock_lexical_backend,
        )

        assert service.session == mock_session
        assert service.vector_backend == mock_vector_backend
        assert service.lexical_backend == mock_lexical_backend


@pytest.mark.unit
class TestHybridSearch:
    """Test hybrid search logic."""

    @pytest.mark.asyncio
    async def test_search_merges_vector_and_lexical_results(
        self,
        mock_session: AsyncMock,
        mock_vector_backend: AsyncMock,
        mock_lexical_backend: AsyncMock,
    ) -> None:
        """Test that search merges results from both backends."""
        # Vector results: (entity_id, distance) where distance 0 = most similar
        mock_vector_backend.vector_search.return_value = [
            ("entity_1", 0.1),  # distance 0.1 -> similarity 0.9
            ("entity_2", 0.3),  # distance 0.3 -> similarity 0.7
        ]

        # Lexical results: (entity_id, similarity) where 1.0 = most similar
        mock_lexical_backend.combined_lexical_search.return_value = [
            ("entity_2", 0.8),
            ("entity_3", 0.6),
        ]

        service = HybridSearchService(
            session=mock_session,
            vector_backend=mock_vector_backend,
            lexical_backend=mock_lexical_backend,
        )

        results = await service.search(
            query_vector=[0.1] * 384,
            query_text="test query",
            k=50,
        )

        # Should have 3 unique entities
        assert len(results) == 3

        # Results should be sorted by max_score (descending)
        entity_ids = [r[0] for r in results]
        scores = [r[1] for r in results]

        # entity_1: vector only, score 0.9
        # entity_2: both, max(0.7, 0.8) = 0.8
        # entity_3: lexical only, score 0.6
        assert entity_ids[0] == "entity_1"  # Highest score 0.9
        assert scores[0] == pytest.approx(0.9)

        assert entity_ids[1] == "entity_2"  # Score 0.8
        assert scores[1] == pytest.approx(0.8)

        assert entity_ids[2] == "entity_3"  # Score 0.6
        assert scores[2] == pytest.approx(0.6)

    @pytest.mark.asyncio
    async def test_search_metadata_contains_scores_and_source(
        self,
        mock_session: AsyncMock,
        mock_vector_backend: AsyncMock,
        mock_lexical_backend: AsyncMock,
    ) -> None:
        """Test that metadata contains vector_score, lexical_score, and source."""
        mock_vector_backend.vector_search.return_value = [
            ("entity_1", 0.2),  # vector only
        ]

        mock_lexical_backend.combined_lexical_search.return_value = [
            ("entity_2", 0.75),  # lexical only
        ]

        service = HybridSearchService(
            session=mock_session,
            vector_backend=mock_vector_backend,
            lexical_backend=mock_lexical_backend,
        )

        results = await service.search(
            query_vector=[0.1] * 384,
            query_text="test query",
            k=50,
        )

        # Find entity_1 (vector only)
        entity_1_result = next(r for r in results if r[0] == "entity_1")
        assert entity_1_result[2].vector_score == pytest.approx(0.8)  # 1 - 0.2
        assert entity_1_result[2].lexical_score is None
        assert entity_1_result[2].source == "vector"

        # Find entity_2 (lexical only)
        entity_2_result = next(r for r in results if r[0] == "entity_2")
        assert entity_2_result[2].vector_score is None
        assert entity_2_result[2].lexical_score == pytest.approx(0.75)
        assert entity_2_result[2].source == "lexical"

    @pytest.mark.asyncio
    async def test_search_both_source_for_overlapping_results(
        self,
        mock_session: AsyncMock,
        mock_vector_backend: AsyncMock,
        mock_lexical_backend: AsyncMock,
    ) -> None:
        """Test that overlapping results have source='both'."""
        mock_vector_backend.vector_search.return_value = [
            ("entity_1", 0.15),  # distance 0.15 -> similarity 0.85
        ]

        mock_lexical_backend.combined_lexical_search.return_value = [
            ("entity_1", 0.9),  # Same entity, different score
        ]

        service = HybridSearchService(
            session=mock_session,
            vector_backend=mock_vector_backend,
            lexical_backend=mock_lexical_backend,
        )

        results = await service.search(
            query_vector=[0.1] * 384,
            query_text="test query",
            k=50,
        )

        assert len(results) == 1
        entity_id, max_score, metadata = results[0]

        assert entity_id == "entity_1"
        assert max_score == pytest.approx(0.9)  # max(0.85, 0.9) = 0.9
        assert metadata.source == "both"
        assert metadata.vector_score == pytest.approx(0.85)
        assert metadata.lexical_score == pytest.approx(0.9)

    @pytest.mark.asyncio
    async def test_search_respects_k_limit(
        self,
        mock_session: AsyncMock,
        mock_vector_backend: AsyncMock,
        mock_lexical_backend: AsyncMock,
    ) -> None:
        """Test that search returns at most k results."""
        # Return many results from both backends
        mock_vector_backend.vector_search.return_value = [
            (f"vector_entity_{i}", 0.1 + (i * 0.05)) for i in range(10)
        ]

        mock_lexical_backend.combined_lexical_search.return_value = [
            (f"lexical_entity_{i}", 0.9 - (i * 0.05)) for i in range(10)
        ]

        service = HybridSearchService(
            session=mock_session,
            vector_backend=mock_vector_backend,
            lexical_backend=mock_lexical_backend,
        )

        results = await service.search(
            query_vector=[0.1] * 384,
            query_text="test query",
            k=5,
        )

        # Should return at most 5 results
        assert len(results) == 5

    @pytest.mark.asyncio
    async def test_search_with_tenant_id(
        self,
        mock_session: AsyncMock,
        mock_vector_backend: AsyncMock,
        mock_lexical_backend: AsyncMock,
    ) -> None:
        """Test that tenant_id is passed to backends."""
        mock_vector_backend.vector_search.return_value = []
        mock_lexical_backend.combined_lexical_search.return_value = []

        service = HybridSearchService(
            session=mock_session,
            vector_backend=mock_vector_backend,
            lexical_backend=mock_lexical_backend,
        )

        await service.search(
            query_vector=[0.1] * 384,
            query_text="test query",
            k=50,
            tenant_id="tenant_123",
        )

        # Verify tenant_id was passed to both backends
        mock_vector_backend.vector_search.assert_called_once()
        call_kwargs = mock_vector_backend.vector_search.call_args.kwargs
        assert call_kwargs["tenant_id"] == "tenant_123"

        mock_lexical_backend.combined_lexical_search.assert_called_once()
        call_kwargs = mock_lexical_backend.combined_lexical_search.call_args.kwargs
        assert call_kwargs["tenant_id"] == "tenant_123"

    @pytest.mark.asyncio
    async def test_search_with_filters(
        self,
        mock_session: AsyncMock,
        mock_vector_backend: AsyncMock,
        mock_lexical_backend: AsyncMock,
    ) -> None:
        """Test that filters are passed to backends."""
        mock_vector_backend.vector_search.return_value = []
        mock_lexical_backend.combined_lexical_search.return_value = []

        filters = SearchFilters(
            source_lists=["OFAC_SDN"],
            risk_categories=["SANCTION"],
            entity_types=["PERSON"],
        )

        service = HybridSearchService(
            session=mock_session,
            vector_backend=mock_vector_backend,
            lexical_backend=mock_lexical_backend,
        )

        await service.search(
            query_vector=[0.1] * 384,
            query_text="test query",
            k=50,
            filters=filters,
        )

        # Verify filters were passed to both backends
        mock_vector_backend.vector_search.assert_called_once()
        call_kwargs = mock_vector_backend.vector_search.call_args.kwargs
        assert call_kwargs["filters"] == filters

        mock_lexical_backend.combined_lexical_search.assert_called_once()
        call_kwargs = mock_lexical_backend.combined_lexical_search.call_args.kwargs
        assert call_kwargs["filters"] == filters

    @pytest.mark.asyncio
    async def test_search_with_ef_search(
        self,
        mock_session: AsyncMock,
        mock_vector_backend: AsyncMock,
        mock_lexical_backend: AsyncMock,
    ) -> None:
        """Test that ef_search parameter is passed to vector backend."""
        mock_vector_backend.vector_search.return_value = []
        mock_lexical_backend.combined_lexical_search.return_value = []

        service = HybridSearchService(
            session=mock_session,
            vector_backend=mock_vector_backend,
            lexical_backend=mock_lexical_backend,
        )

        await service.search(
            query_vector=[0.1] * 384,
            query_text="test query",
            k=50,
            ef_search=200,
        )

        mock_vector_backend.vector_search.assert_called_once()
        call_kwargs = mock_vector_backend.vector_search.call_args.kwargs
        assert call_kwargs["ef_search"] == 200

    @pytest.mark.asyncio
    async def test_search_with_similarity_threshold(
        self,
        mock_session: AsyncMock,
        mock_vector_backend: AsyncMock,
        mock_lexical_backend: AsyncMock,
    ) -> None:
        """Test that similarity_threshold is passed to lexical backend."""
        mock_vector_backend.vector_search.return_value = []
        mock_lexical_backend.combined_lexical_search.return_value = []

        service = HybridSearchService(
            session=mock_session,
            vector_backend=mock_vector_backend,
            lexical_backend=mock_lexical_backend,
        )

        await service.search(
            query_vector=[0.1] * 384,
            query_text="test query",
            k=50,
            similarity_threshold=0.5,
        )

        mock_lexical_backend.combined_lexical_search.assert_called_once()
        call_kwargs = mock_lexical_backend.combined_lexical_search.call_args.kwargs
        assert call_kwargs["similarity_threshold"] == 0.5

    @pytest.mark.asyncio
    async def test_search_empty_results(
        self,
        mock_session: AsyncMock,
        mock_vector_backend: AsyncMock,
        mock_lexical_backend: AsyncMock,
    ) -> None:
        """Test search with no results from either backend."""
        mock_vector_backend.vector_search.return_value = []
        mock_lexical_backend.combined_lexical_search.return_value = []

        service = HybridSearchService(
            session=mock_session,
            vector_backend=mock_vector_backend,
            lexical_backend=mock_lexical_backend,
        )

        results = await service.search(
            query_vector=[0.1] * 384,
            query_text="test query",
            k=50,
        )

        assert results == []


@pytest.mark.unit
class TestSearchCandidates:
    """Test search_candidates method."""

    @pytest.mark.asyncio
    async def test_search_candidates_returns_entity_ids(
        self,
        mock_session: AsyncMock,
        mock_vector_backend: AsyncMock,
        mock_lexical_backend: AsyncMock,
    ) -> None:
        """Test that search_candidates returns only entity IDs."""
        mock_vector_backend.vector_search.return_value = [
            ("entity_1", 0.1),
            ("entity_2", 0.2),
        ]

        mock_lexical_backend.combined_lexical_search.return_value = [
            ("entity_3", 0.8),
        ]

        service = HybridSearchService(
            session=mock_session,
            vector_backend=mock_vector_backend,
            lexical_backend=mock_lexical_backend,
        )

        candidates = await service.search_candidates(
            query_vector=[0.1] * 384,
            query_text="test query",
            k=50,
        )

        # Should return list of entity IDs
        assert isinstance(candidates, list)
        assert len(candidates) == 3
        assert all(isinstance(c, str) for c in candidates)
        assert "entity_1" in candidates
        assert "entity_2" in candidates
        assert "entity_3" in candidates

    @pytest.mark.asyncio
    async def test_search_candidates_respects_k_limit(
        self,
        mock_session: AsyncMock,
        mock_vector_backend: AsyncMock,
        mock_lexical_backend: AsyncMock,
    ) -> None:
        """Test that search_candidates returns at most k candidates."""
        mock_vector_backend.vector_search.return_value = [
            (f"entity_{i}", 0.1 + i * 0.01) for i in range(10)
        ]
        mock_lexical_backend.combined_lexical_search.return_value = []

        service = HybridSearchService(
            session=mock_session,
            vector_backend=mock_vector_backend,
            lexical_backend=mock_lexical_backend,
        )

        candidates = await service.search_candidates(
            query_vector=[0.1] * 384,
            query_text="test query",
            k=3,
        )

        assert len(candidates) == 3

    @pytest.mark.asyncio
    async def test_search_candidates_preserves_order(
        self,
        mock_session: AsyncMock,
        mock_vector_backend: AsyncMock,
        mock_lexical_backend: AsyncMock,
    ) -> None:
        """Test that candidates are returned in order of relevance."""
        mock_vector_backend.vector_search.return_value = [
            ("entity_low", 0.5),  # distance 0.5 -> similarity 0.5
        ]

        mock_lexical_backend.combined_lexical_search.return_value = [
            ("entity_high", 0.95),
        ]

        service = HybridSearchService(
            session=mock_session,
            vector_backend=mock_vector_backend,
            lexical_backend=mock_lexical_backend,
        )

        candidates = await service.search_candidates(
            query_vector=[0.1] * 384,
            query_text="test query",
            k=50,
        )

        # Higher scoring entity should come first
        assert candidates[0] == "entity_high"
        assert candidates[1] == "entity_low"

    @pytest.mark.asyncio
    async def test_search_candidates_passes_all_parameters(
        self,
        mock_session: AsyncMock,
        mock_vector_backend: AsyncMock,
        mock_lexical_backend: AsyncMock,
    ) -> None:
        """Test that all parameters are passed through to search."""
        mock_vector_backend.vector_search.return_value = []
        mock_lexical_backend.combined_lexical_search.return_value = []

        filters = SearchFilters(source_lists=["OFAC_SDN"])

        service = HybridSearchService(
            session=mock_session,
            vector_backend=mock_vector_backend,
            lexical_backend=mock_lexical_backend,
        )

        await service.search_candidates(
            query_vector=[0.1] * 384,
            query_text="test query",
            k=25,
            tenant_id="tenant_abc",
            filters=filters,
            ef_search=150,
            similarity_threshold=0.4,
        )

        # Verify vector backend received all relevant params
        mock_vector_backend.vector_search.assert_called_once_with(
            query_vector=[0.1] * 384,
            k=25,
            tenant_id="tenant_abc",
            filters=filters,
            ef_search=150,
        )

        # Verify lexical backend received all relevant params
        mock_lexical_backend.combined_lexical_search.assert_called_once_with(
            query_text="test query",
            k=25,
            tenant_id="tenant_abc",
            filters=filters,
            similarity_threshold=0.4,
        )


@pytest.mark.unit
class TestScoreConversion:
    """Test score conversion from distance to similarity."""

    @pytest.mark.asyncio
    async def test_distance_to_similarity_conversion(
        self,
        mock_session: AsyncMock,
        mock_vector_backend: AsyncMock,
        mock_lexical_backend: AsyncMock,
    ) -> None:
        """Test that vector distance is correctly converted to similarity."""
        # Distance 0 = most similar -> similarity 1.0
        # Distance 1 = least similar -> similarity 0.0
        mock_vector_backend.vector_search.return_value = [
            ("entity_perfect", 0.0),  # Perfect match
            ("entity_good", 0.25),  # Good match
            ("entity_mid", 0.5),  # Mid match
            ("entity_low", 0.75),  # Low match
        ]
        mock_lexical_backend.combined_lexical_search.return_value = []

        service = HybridSearchService(
            session=mock_session,
            vector_backend=mock_vector_backend,
            lexical_backend=mock_lexical_backend,
        )

        results = await service.search(
            query_vector=[0.1] * 384,
            query_text="test query",
            k=50,
        )

        # Check converted similarities
        result_dict = {r[0]: r[2].vector_score for r in results}

        assert result_dict["entity_perfect"] == pytest.approx(1.0)
        assert result_dict["entity_good"] == pytest.approx(0.75)
        assert result_dict["entity_mid"] == pytest.approx(0.5)
        assert result_dict["entity_low"] == pytest.approx(0.25)

    @pytest.mark.asyncio
    async def test_lexical_score_unchanged(
        self,
        mock_session: AsyncMock,
        mock_vector_backend: AsyncMock,
        mock_lexical_backend: AsyncMock,
    ) -> None:
        """Test that lexical similarity scores are unchanged."""
        mock_vector_backend.vector_search.return_value = []
        mock_lexical_backend.combined_lexical_search.return_value = [
            ("entity_1", 0.95),
            ("entity_2", 0.67),
        ]

        service = HybridSearchService(
            session=mock_session,
            vector_backend=mock_vector_backend,
            lexical_backend=mock_lexical_backend,
        )

        results = await service.search(
            query_vector=[0.1] * 384,
            query_text="test query",
            k=50,
        )

        result_dict = {r[0]: r[2].lexical_score for r in results}

        assert result_dict["entity_1"] == pytest.approx(0.95)
        assert result_dict["entity_2"] == pytest.approx(0.67)
