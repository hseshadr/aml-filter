"""Unit tests for pgvector search backend."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from shared_libs_python import IndexConfig

from aml_filter.domain.search import SearchFilters
from aml_filter.search.pgvector_backend import PgVectorBackend


@pytest.fixture
def mock_session() -> AsyncMock:
    """Create a mock async session."""
    return AsyncMock()


@pytest.fixture
def mock_index_manager() -> AsyncMock:
    """Create a mock index manager."""
    manager = AsyncMock()
    manager.search = AsyncMock()
    manager.insert = AsyncMock()
    manager.delete = AsyncMock()
    manager.partition_strategy = MagicMock()
    return manager


@pytest.mark.unit
class TestPgVectorBackendInit:
    """Test PgVectorBackend initialization."""

    async def test_pgvector_backend_initialization(self, session: Any) -> None:
        """Test that pgvector backend initializes correctly."""
        backend = PgVectorBackend(session=session)
        assert backend.session == session

    def test_pgvector_backend_stores_session(self, mock_session: AsyncMock) -> None:
        """Test that the session is stored correctly."""
        backend = PgVectorBackend(session=mock_session)
        assert backend.session is mock_session

    def test_pgvector_backend_default_config(self, mock_session: AsyncMock) -> None:
        """Test that default index config is created."""
        backend = PgVectorBackend(session=mock_session)
        assert backend.index_config is not None
        assert backend.index_config.m == 32
        assert backend.index_config.ef_construction == 200
        assert backend.index_config.ef_search == 100
        assert backend.index_config.dimension == 1536

    def test_pgvector_backend_custom_config(self, mock_session: AsyncMock) -> None:
        """Test initialization with custom config."""
        custom_config = IndexConfig(
            m=16,
            ef_construction=100,
            ef_search=50,
            dimension=384,
        )
        backend = PgVectorBackend(
            session=mock_session,
            index_config=custom_config,
        )
        assert backend.index_config == custom_config
        assert backend.index_config.m == 16
        assert backend.index_config.dimension == 384

    def test_pgvector_backend_creates_index_manager(self, mock_session: AsyncMock) -> None:
        """Test that index manager is created."""
        backend = PgVectorBackend(session=mock_session)
        assert backend.index_manager is not None


@pytest.mark.unit
class TestVectorSearch:
    """Test vector_search method."""

    @pytest.mark.asyncio
    async def test_vector_search_returns_results(self, mock_session: AsyncMock) -> None:
        """Test that vector_search returns results in correct format."""
        backend = PgVectorBackend(session=mock_session)

        # Mock index_manager.search
        backend.index_manager = MagicMock()
        backend.index_manager.search = AsyncMock(
            return_value=[
                ("entity_1", 0.1),
                ("entity_2", 0.25),
            ]
        )

        results = await backend.vector_search(
            query_vector=[0.1] * 384,
            k=10,
        )

        assert len(results) == 2
        assert results[0] == ("entity_1", 0.1)
        assert results[1] == ("entity_2", 0.25)

    @pytest.mark.asyncio
    async def test_vector_search_empty_results(self, mock_session: AsyncMock) -> None:
        """Test vector_search returns empty list when no matches."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.search = AsyncMock(return_value=[])

        results = await backend.vector_search(
            query_vector=[0.1] * 384,
            k=10,
        )

        assert results == []

    @pytest.mark.asyncio
    async def test_vector_search_with_tenant_id(self, mock_session: AsyncMock) -> None:
        """Test vector_search passes tenant_id as partition_key."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.search = AsyncMock(return_value=[])

        await backend.vector_search(
            query_vector=[0.1] * 384,
            k=10,
            tenant_id="tenant_123",
        )

        backend.index_manager.search.assert_called_once()
        call_kwargs = backend.index_manager.search.call_args.kwargs
        assert call_kwargs["partition_key"] == "tenant_123"

    @pytest.mark.asyncio
    async def test_vector_search_without_tenant_id(self, mock_session: AsyncMock) -> None:
        """Test vector_search with None tenant_id."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.search = AsyncMock(return_value=[])

        await backend.vector_search(
            query_vector=[0.1] * 384,
            k=10,
            tenant_id=None,
        )

        backend.index_manager.search.assert_called_once()
        call_kwargs = backend.index_manager.search.call_args.kwargs
        assert call_kwargs["partition_key"] is None

    @pytest.mark.asyncio
    async def test_vector_search_with_source_lists_filter(
        self, mock_session: AsyncMock
    ) -> None:
        """Test vector_search applies source_lists filter."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.search = AsyncMock(return_value=[])

        filters = SearchFilters(source_lists=["OFAC_SDN", "EU_SANCTIONS"])

        await backend.vector_search(
            query_vector=[0.1] * 384,
            k=10,
            filters=filters,
        )

        backend.index_manager.search.assert_called_once()
        call_kwargs = backend.index_manager.search.call_args.kwargs
        assert call_kwargs["filters"]["source_list"] == ["OFAC_SDN", "EU_SANCTIONS"]

    @pytest.mark.asyncio
    async def test_vector_search_with_risk_categories_filter(
        self, mock_session: AsyncMock
    ) -> None:
        """Test vector_search applies risk_categories filter."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.search = AsyncMock(return_value=[])

        filters = SearchFilters(risk_categories=["SANCTION", "PEP"])

        await backend.vector_search(
            query_vector=[0.1] * 384,
            k=10,
            filters=filters,
        )

        backend.index_manager.search.assert_called_once()
        call_kwargs = backend.index_manager.search.call_args.kwargs
        assert call_kwargs["filters"]["risk_category"] == ["SANCTION", "PEP"]

    @pytest.mark.asyncio
    async def test_vector_search_with_entity_types_filter(
        self, mock_session: AsyncMock
    ) -> None:
        """Test vector_search applies entity_types filter."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.search = AsyncMock(return_value=[])

        filters = SearchFilters(entity_types=["PERSON"])

        await backend.vector_search(
            query_vector=[0.1] * 384,
            k=10,
            filters=filters,
        )

        backend.index_manager.search.assert_called_once()
        call_kwargs = backend.index_manager.search.call_args.kwargs
        assert call_kwargs["filters"]["entity_type"] == ["PERSON"]

    @pytest.mark.asyncio
    async def test_vector_search_with_all_filters(self, mock_session: AsyncMock) -> None:
        """Test vector_search with all filters combined."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.search = AsyncMock(return_value=[])

        filters = SearchFilters(
            source_lists=["OFAC_SDN"],
            risk_categories=["SANCTION"],
            entity_types=["PERSON"],
        )

        await backend.vector_search(
            query_vector=[0.1] * 384,
            k=10,
            tenant_id="tenant_123",
            filters=filters,
        )

        backend.index_manager.search.assert_called_once()
        call_kwargs = backend.index_manager.search.call_args.kwargs
        assert call_kwargs["filters"]["source_list"] == ["OFAC_SDN"]
        assert call_kwargs["filters"]["risk_category"] == ["SANCTION"]
        assert call_kwargs["filters"]["entity_type"] == ["PERSON"]

    @pytest.mark.asyncio
    async def test_vector_search_with_no_filters(self, mock_session: AsyncMock) -> None:
        """Test vector_search with no filters passes empty dict."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.search = AsyncMock(return_value=[])

        await backend.vector_search(
            query_vector=[0.1] * 384,
            k=10,
            filters=None,
        )

        backend.index_manager.search.assert_called_once()
        call_kwargs = backend.index_manager.search.call_args.kwargs
        assert call_kwargs["filters"] == {}

    @pytest.mark.asyncio
    async def test_vector_search_with_ef_search(self, mock_session: AsyncMock) -> None:
        """Test vector_search passes ef_search parameter."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.search = AsyncMock(return_value=[])

        await backend.vector_search(
            query_vector=[0.1] * 384,
            k=10,
            ef_search=200,
        )

        backend.index_manager.search.assert_called_once()
        call_kwargs = backend.index_manager.search.call_args.kwargs
        assert call_kwargs["ef_search"] == 200

    @pytest.mark.asyncio
    async def test_vector_search_with_default_ef_search(
        self, mock_session: AsyncMock
    ) -> None:
        """Test vector_search uses config ef_search when not specified."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.search = AsyncMock(return_value=[])

        await backend.vector_search(
            query_vector=[0.1] * 384,
            k=10,
            ef_search=None,
        )

        backend.index_manager.search.assert_called_once()
        call_kwargs = backend.index_manager.search.call_args.kwargs
        # Default from config is 100
        assert call_kwargs["ef_search"] == 100

    @pytest.mark.asyncio
    async def test_vector_search_respects_k_limit(self, mock_session: AsyncMock) -> None:
        """Test that k parameter is passed to search."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.search = AsyncMock(return_value=[])

        await backend.vector_search(
            query_vector=[0.1] * 384,
            k=25,
        )

        backend.index_manager.search.assert_called_once()
        call_kwargs = backend.index_manager.search.call_args.kwargs
        assert call_kwargs["k"] == 25


@pytest.mark.unit
class TestInsertEmbeddings:
    """Test insert_embeddings method."""

    @pytest.mark.asyncio
    async def test_insert_embeddings_success(self, mock_session: AsyncMock) -> None:
        """Test successful embedding insertion."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.insert = AsyncMock()

        from shared_libs_python.core.types import VectorEmbedding

        embeddings = [
            VectorEmbedding(entity_id="entity_1", embedding=[0.1] * 384),
            VectorEmbedding(entity_id="entity_2", embedding=[0.2] * 384),
        ]

        await backend.insert_embeddings(embeddings=embeddings)

        backend.index_manager.insert.assert_called_once_with(
            embeddings=embeddings,
            partition_key=None,
        )

    @pytest.mark.asyncio
    async def test_insert_embeddings_with_tenant_id(
        self, mock_session: AsyncMock
    ) -> None:
        """Test embedding insertion with tenant_id."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.insert = AsyncMock()

        from shared_libs_python.core.types import VectorEmbedding

        embeddings = [
            VectorEmbedding(entity_id="entity_1", embedding=[0.1] * 384),
        ]

        await backend.insert_embeddings(
            embeddings=embeddings,
            tenant_id="tenant_123",
        )

        backend.index_manager.insert.assert_called_once()
        call_kwargs = backend.index_manager.insert.call_args.kwargs
        assert call_kwargs["partition_key"] == "tenant_123"

    @pytest.mark.asyncio
    async def test_insert_embeddings_empty_list(self, mock_session: AsyncMock) -> None:
        """Test embedding insertion with empty list."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.insert = AsyncMock()

        await backend.insert_embeddings(embeddings=[])

        backend.index_manager.insert.assert_called_once_with(
            embeddings=[],
            partition_key=None,
        )


@pytest.mark.unit
class TestDeleteEmbeddings:
    """Test delete_embeddings method."""

    @pytest.mark.asyncio
    async def test_delete_embeddings_success(self, mock_session: AsyncMock) -> None:
        """Test successful embedding deletion."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.delete = AsyncMock()

        entity_ids = ["entity_1", "entity_2"]

        await backend.delete_embeddings(entity_ids=entity_ids)

        backend.index_manager.delete.assert_called_once_with(
            entity_ids=entity_ids,
            partition_key=None,
        )

    @pytest.mark.asyncio
    async def test_delete_embeddings_with_tenant_id(
        self, mock_session: AsyncMock
    ) -> None:
        """Test embedding deletion with tenant_id."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.delete = AsyncMock()

        entity_ids = ["entity_1"]

        await backend.delete_embeddings(
            entity_ids=entity_ids,
            tenant_id="tenant_123",
        )

        backend.index_manager.delete.assert_called_once()
        call_kwargs = backend.index_manager.delete.call_args.kwargs
        assert call_kwargs["partition_key"] == "tenant_123"

    @pytest.mark.asyncio
    async def test_delete_embeddings_empty_list(self, mock_session: AsyncMock) -> None:
        """Test embedding deletion with empty list."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.delete = AsyncMock()

        await backend.delete_embeddings(entity_ids=[])

        backend.index_manager.delete.assert_called_once_with(
            entity_ids=[],
            partition_key=None,
        )


@pytest.mark.unit
class TestGetIndexStats:
    """Test get_index_stats method."""

    @pytest.mark.asyncio
    async def test_get_index_stats_returns_dict(self, mock_session: AsyncMock) -> None:
        """Test get_index_stats returns stats dictionary."""
        backend = PgVectorBackend(session=mock_session)

        # Mock stats object
        from shared_libs_python.core.types import IndexStats

        mock_stats = IndexStats(
            index_name="entity_embeddings_global",
            vector_count=1000,
            index_size_mb=50.5,
            tombstone_count=10,
            tombstone_percentage=1.0,
        )

        mock_index = MagicMock()
        mock_index.get_stats = AsyncMock(return_value=mock_stats)

        backend.index_manager = MagicMock()
        backend.index_manager.partition_strategy = MagicMock()
        backend.index_manager.partition_strategy.get_index = AsyncMock(
            return_value=mock_index
        )

        stats = await backend.get_index_stats()

        assert stats["index_name"] == "entity_embeddings_global"
        assert stats["vector_count"] == 1000
        assert stats["index_size_mb"] == 50.5
        assert stats["tombstone_count"] == 10
        assert stats["tombstone_percentage"] == 1.0

    @pytest.mark.asyncio
    async def test_get_index_stats_empty_index(self, mock_session: AsyncMock) -> None:
        """Test get_index_stats for empty index."""
        backend = PgVectorBackend(session=mock_session)

        from shared_libs_python.core.types import IndexStats

        mock_stats = IndexStats(
            index_name="entity_embeddings_global",
            vector_count=0,
            index_size_mb=0.0,
            tombstone_count=0,
            tombstone_percentage=0.0,
        )

        mock_index = MagicMock()
        mock_index.get_stats = AsyncMock(return_value=mock_stats)

        backend.index_manager = MagicMock()
        backend.index_manager.partition_strategy = MagicMock()
        backend.index_manager.partition_strategy.get_index = AsyncMock(
            return_value=mock_index
        )

        stats = await backend.get_index_stats()

        assert stats["vector_count"] == 0
        assert stats["index_size_mb"] == 0.0


@pytest.mark.unit
class TestFilterConversion:
    """Test filter conversion to IndexManager format."""

    @pytest.mark.asyncio
    async def test_filters_converted_to_flat_dict(
        self, mock_session: AsyncMock
    ) -> None:
        """Test that SearchFilters are converted to flat dictionary."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.search = AsyncMock(return_value=[])

        filters = SearchFilters(
            source_lists=["OFAC_SDN"],
            risk_categories=["SANCTION"],
            entity_types=["PERSON"],
        )

        await backend.vector_search(
            query_vector=[0.1] * 384,
            k=10,
            filters=filters,
        )

        call_kwargs = backend.index_manager.search.call_args.kwargs
        # Filter keys should be transformed
        assert "source_list" in call_kwargs["filters"]
        assert "risk_category" in call_kwargs["filters"]
        assert "entity_type" in call_kwargs["filters"]

    @pytest.mark.asyncio
    async def test_empty_filters_result_in_empty_dict(
        self, mock_session: AsyncMock
    ) -> None:
        """Test that empty SearchFilters results in empty filter dict."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.search = AsyncMock(return_value=[])

        filters = SearchFilters()  # All None

        await backend.vector_search(
            query_vector=[0.1] * 384,
            k=10,
            filters=filters,
        )

        call_kwargs = backend.index_manager.search.call_args.kwargs
        assert call_kwargs["filters"] == {}

    @pytest.mark.asyncio
    async def test_partial_filters(self, mock_session: AsyncMock) -> None:
        """Test that partial filters only include non-None values."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.search = AsyncMock(return_value=[])

        filters = SearchFilters(
            source_lists=["OFAC_SDN"],
            risk_categories=None,  # Not set
            entity_types=None,  # Not set
        )

        await backend.vector_search(
            query_vector=[0.1] * 384,
            k=10,
            filters=filters,
        )

        call_kwargs = backend.index_manager.search.call_args.kwargs
        assert "source_list" in call_kwargs["filters"]
        assert "risk_category" not in call_kwargs["filters"]
        assert "entity_type" not in call_kwargs["filters"]


@pytest.mark.unit
class TestResultFormat:
    """Test result formatting in PgVectorBackend."""

    @pytest.mark.asyncio
    async def test_results_are_tuples(self, mock_session: AsyncMock) -> None:
        """Test that results are tuples of (entity_id, distance)."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.search = AsyncMock(
            return_value=[("entity_123", 0.15)]
        )

        results = await backend.vector_search(
            query_vector=[0.1] * 384,
            k=10,
        )

        assert len(results) == 1
        assert isinstance(results[0], tuple)
        assert len(results[0]) == 2
        assert results[0][0] == "entity_123"
        assert results[0][1] == 0.15

    @pytest.mark.asyncio
    async def test_results_sorted_by_distance_ascending(
        self, mock_session: AsyncMock
    ) -> None:
        """Test that results are sorted by distance ascending."""
        backend = PgVectorBackend(session=mock_session)

        # Results from index_manager should come sorted
        backend.index_manager = MagicMock()
        backend.index_manager.search = AsyncMock(
            return_value=[
                ("entity_1", 0.05),
                ("entity_2", 0.15),
                ("entity_3", 0.25),
            ]
        )

        results = await backend.vector_search(
            query_vector=[0.1] * 384,
            k=10,
        )

        # Verify order is maintained (lowest distance first)
        distances = [r[1] for r in results]
        assert distances == [0.05, 0.15, 0.25]


@pytest.mark.unit
class TestPgVectorBackendIntegration:
    """Integration-style tests for PgVectorBackend."""

    @pytest.mark.asyncio
    async def test_search_then_insert_then_search(
        self, mock_session: AsyncMock
    ) -> None:
        """Test a typical workflow of search, insert, search."""
        backend = PgVectorBackend(session=mock_session)

        backend.index_manager = MagicMock()
        backend.index_manager.search = AsyncMock(return_value=[])
        backend.index_manager.insert = AsyncMock()

        # First search - empty
        results1 = await backend.vector_search(
            query_vector=[0.1] * 384,
            k=10,
        )
        assert results1 == []

        # Insert embeddings
        from shared_libs_python.core.types import VectorEmbedding

        embeddings = [
            VectorEmbedding(entity_id="entity_1", embedding=[0.1] * 384),
        ]
        await backend.insert_embeddings(embeddings=embeddings)

        backend.index_manager.insert.assert_called_once()

        # Second search - returns results
        backend.index_manager.search = AsyncMock(
            return_value=[("entity_1", 0.0)]
        )
        results2 = await backend.vector_search(
            query_vector=[0.1] * 384,
            k=10,
        )
        assert len(results2) == 1
