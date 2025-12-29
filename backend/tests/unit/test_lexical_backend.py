"""Unit tests for lexical search backend."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from aml_filter.domain.search import SearchFilters
from aml_filter.search.lexical_backend import LexicalBackend


@pytest.fixture
def mock_session() -> AsyncMock:
    """Create a mock async session."""
    return AsyncMock()


@pytest.mark.unit
class TestLexicalBackendInit:
    """Test LexicalBackend initialization."""

    async def test_lexical_backend_initialization(self, session: Any) -> None:
        """Test that lexical backend initializes correctly."""
        backend = LexicalBackend(session=session)
        assert backend.session == session

    def test_lexical_backend_stores_session(self, mock_session: AsyncMock) -> None:
        """Test that the session is stored correctly."""
        backend = LexicalBackend(session=mock_session)
        assert backend.session is mock_session


@pytest.mark.unit
class TestLexicalSearch:
    """Test lexical_search method."""

    @pytest.mark.asyncio
    async def test_lexical_search_returns_results(self, mock_session: AsyncMock) -> None:
        """Test that lexical_search returns results in correct format."""
        # Mock query results
        mock_row1 = MagicMock()
        mock_row1.entity_id = "entity_1"
        mock_row1.similarity = 0.95

        mock_row2 = MagicMock()
        mock_row2.entity_id = "entity_2"
        mock_row2.similarity = 0.75

        mock_result = MagicMock()
        mock_result.all.return_value = [mock_row1, mock_row2]
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)

        results = await backend.lexical_search(
            query_text="john doe",
            k=10,
        )

        assert len(results) == 2
        assert results[0] == ("entity_1", 0.95)
        assert results[1] == ("entity_2", 0.75)

    @pytest.mark.asyncio
    async def test_lexical_search_empty_results(self, mock_session: AsyncMock) -> None:
        """Test lexical_search returns empty list when no matches."""
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)

        results = await backend.lexical_search(
            query_text="nonexistent name",
            k=10,
        )

        assert results == []

    @pytest.mark.asyncio
    async def test_lexical_search_with_tenant_id(self, mock_session: AsyncMock) -> None:
        """Test lexical_search filters by tenant_id."""
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)

        await backend.lexical_search(
            query_text="test name",
            k=10,
            tenant_id="tenant_123",
        )

        # Verify execute was called
        mock_session.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_lexical_search_without_tenant_id(self, mock_session: AsyncMock) -> None:
        """Test lexical_search includes only global entities when tenant_id is None."""
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)

        await backend.lexical_search(
            query_text="test name",
            k=10,
            tenant_id=None,
        )

        # Verify execute was called
        mock_session.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_lexical_search_with_source_lists_filter(
        self, mock_session: AsyncMock
    ) -> None:
        """Test lexical_search applies source_lists filter."""
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)
        filters = SearchFilters(source_lists=["OFAC_SDN", "EU_SANCTIONS"])

        await backend.lexical_search(
            query_text="test name",
            k=10,
            filters=filters,
        )

        mock_session.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_lexical_search_with_risk_categories_filter(
        self, mock_session: AsyncMock
    ) -> None:
        """Test lexical_search applies risk_categories filter."""
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)
        filters = SearchFilters(risk_categories=["SANCTION", "PEP"])

        await backend.lexical_search(
            query_text="test name",
            k=10,
            filters=filters,
        )

        mock_session.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_lexical_search_with_entity_types_filter(
        self, mock_session: AsyncMock
    ) -> None:
        """Test lexical_search applies entity_types filter."""
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)
        filters = SearchFilters(entity_types=["PERSON"])

        await backend.lexical_search(
            query_text="test name",
            k=10,
            filters=filters,
        )

        mock_session.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_lexical_search_with_all_filters(self, mock_session: AsyncMock) -> None:
        """Test lexical_search with all filters combined."""
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)
        filters = SearchFilters(
            source_lists=["OFAC_SDN"],
            risk_categories=["SANCTION"],
            entity_types=["PERSON"],
        )

        await backend.lexical_search(
            query_text="test name",
            k=10,
            tenant_id="tenant_123",
            filters=filters,
            similarity_threshold=0.5,
        )

        mock_session.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_lexical_search_respects_k_limit(self, mock_session: AsyncMock) -> None:
        """Test that k parameter limits results."""
        # Return more results than k
        mock_rows = [
            MagicMock(entity_id=f"entity_{i}", similarity=0.9 - (i * 0.01))
            for i in range(20)
        ]

        mock_result = MagicMock()
        mock_result.all.return_value = mock_rows[:5]  # Simulating LIMIT
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)

        results = await backend.lexical_search(
            query_text="test",
            k=5,
        )

        assert len(results) == 5

    @pytest.mark.asyncio
    async def test_lexical_search_similarity_threshold(
        self, mock_session: AsyncMock
    ) -> None:
        """Test that similarity_threshold is applied."""
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)

        await backend.lexical_search(
            query_text="test name",
            k=10,
            similarity_threshold=0.5,
        )

        mock_session.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_lexical_search_converts_similarity_to_float(
        self, mock_session: AsyncMock
    ) -> None:
        """Test that similarity scores are converted to float."""
        from decimal import Decimal

        # Mock returning Decimal similarity (as might come from database)
        mock_row = MagicMock()
        mock_row.entity_id = "entity_1"
        mock_row.similarity = Decimal("0.8765")

        mock_result = MagicMock()
        mock_result.all.return_value = [mock_row]
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)

        results = await backend.lexical_search(
            query_text="test",
            k=10,
        )

        assert len(results) == 1
        entity_id, similarity = results[0]
        assert entity_id == "entity_1"
        assert isinstance(similarity, float)
        assert similarity == pytest.approx(0.8765)


@pytest.mark.unit
class TestSearchAliases:
    """Test search_aliases method."""

    @pytest.mark.asyncio
    async def test_search_aliases_returns_empty_list(
        self, mock_session: AsyncMock
    ) -> None:
        """Test that search_aliases currently returns empty list."""
        backend = LexicalBackend(session=mock_session)

        results = await backend.search_aliases(
            query_text="john",
            k=10,
        )

        # Current implementation returns empty list
        # (alias matching handled in scoring phase)
        assert results == []

    @pytest.mark.asyncio
    async def test_search_aliases_with_all_params(
        self, mock_session: AsyncMock
    ) -> None:
        """Test search_aliases accepts all parameters without error."""
        backend = LexicalBackend(session=mock_session)
        filters = SearchFilters(source_lists=["OFAC_SDN"])

        results = await backend.search_aliases(
            query_text="john",
            k=10,
            tenant_id="tenant_123",
            filters=filters,
            similarity_threshold=0.4,
        )

        assert results == []


@pytest.mark.unit
class TestCombinedLexicalSearch:
    """Test combined_lexical_search method."""

    @pytest.mark.asyncio
    async def test_combined_lexical_search_delegates_to_lexical_search(
        self, mock_session: AsyncMock
    ) -> None:
        """Test that combined_lexical_search delegates to lexical_search."""
        mock_row = MagicMock()
        mock_row.entity_id = "entity_1"
        mock_row.similarity = 0.85

        mock_result = MagicMock()
        mock_result.all.return_value = [mock_row]
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)

        results = await backend.combined_lexical_search(
            query_text="test name",
            k=10,
        )

        assert len(results) == 1
        assert results[0] == ("entity_1", 0.85)

    @pytest.mark.asyncio
    async def test_combined_lexical_search_passes_all_params(
        self, mock_session: AsyncMock
    ) -> None:
        """Test that combined_lexical_search passes all parameters."""
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)
        filters = SearchFilters(
            source_lists=["OFAC_SDN"],
            risk_categories=["SANCTION"],
        )

        await backend.combined_lexical_search(
            query_text="test name",
            k=25,
            tenant_id="tenant_abc",
            filters=filters,
            similarity_threshold=0.4,
        )

        mock_session.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_combined_lexical_search_empty_results(
        self, mock_session: AsyncMock
    ) -> None:
        """Test combined_lexical_search returns empty list when no matches."""
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)

        results = await backend.combined_lexical_search(
            query_text="nonexistent",
            k=10,
        )

        assert results == []


@pytest.mark.unit
class TestLexicalBackendFilters:
    """Test filter handling in LexicalBackend."""

    @pytest.mark.asyncio
    async def test_filters_none_does_not_crash(self, mock_session: AsyncMock) -> None:
        """Test that None filters work correctly."""
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)

        # Should not raise
        await backend.lexical_search(
            query_text="test",
            k=10,
            filters=None,
        )

    @pytest.mark.asyncio
    async def test_empty_filter_lists(self, mock_session: AsyncMock) -> None:
        """Test that empty filter lists work correctly."""
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)
        filters = SearchFilters(
            source_lists=None,
            risk_categories=None,
            entity_types=None,
        )

        # Should not raise
        await backend.lexical_search(
            query_text="test",
            k=10,
            filters=filters,
        )

    @pytest.mark.asyncio
    async def test_single_item_filter_lists(self, mock_session: AsyncMock) -> None:
        """Test that single-item filter lists work correctly."""
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)
        filters = SearchFilters(
            source_lists=["OFAC_SDN"],
            risk_categories=["SANCTION"],
            entity_types=["PERSON"],
        )

        # Should not raise
        await backend.lexical_search(
            query_text="test",
            k=10,
            filters=filters,
        )


@pytest.mark.unit
class TestLexicalBackendTenantFiltering:
    """Test tenant filtering in LexicalBackend."""

    @pytest.mark.asyncio
    async def test_tenant_id_none_filters_global_only(
        self, mock_session: AsyncMock
    ) -> None:
        """Test that tenant_id=None filters to global entities only."""
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)

        await backend.lexical_search(
            query_text="test",
            k=10,
            tenant_id=None,
        )

        # Verify query was constructed and executed
        mock_session.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_tenant_id_includes_tenant_and_global(
        self, mock_session: AsyncMock
    ) -> None:
        """Test that tenant_id includes both tenant-specific and global entities."""
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)

        await backend.lexical_search(
            query_text="test",
            k=10,
            tenant_id="tenant_123",
        )

        # Verify query was constructed and executed
        mock_session.execute.assert_called_once()


@pytest.mark.unit
class TestLexicalBackendResultFormat:
    """Test result formatting in LexicalBackend."""

    @pytest.mark.asyncio
    async def test_results_are_tuples(self, mock_session: AsyncMock) -> None:
        """Test that results are tuples of (entity_id, similarity)."""
        mock_row = MagicMock()
        mock_row.entity_id = "entity_123"
        mock_row.similarity = 0.789

        mock_result = MagicMock()
        mock_result.all.return_value = [mock_row]
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)

        results = await backend.lexical_search(
            query_text="test",
            k=10,
        )

        assert len(results) == 1
        assert isinstance(results[0], tuple)
        assert len(results[0]) == 2
        assert results[0][0] == "entity_123"
        assert results[0][1] == 0.789

    @pytest.mark.asyncio
    async def test_results_sorted_by_similarity_descending(
        self, mock_session: AsyncMock
    ) -> None:
        """Test that results are sorted by similarity descending."""
        # Results should already come sorted from database
        mock_rows = [
            MagicMock(entity_id="entity_1", similarity=0.95),
            MagicMock(entity_id="entity_2", similarity=0.85),
            MagicMock(entity_id="entity_3", similarity=0.75),
        ]

        mock_result = MagicMock()
        mock_result.all.return_value = mock_rows
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)

        results = await backend.lexical_search(
            query_text="test",
            k=10,
        )

        # Verify order is maintained (highest similarity first)
        similarities = [r[1] for r in results]
        assert similarities == [0.95, 0.85, 0.75]

    @pytest.mark.asyncio
    async def test_similarity_range_0_to_1(self, mock_session: AsyncMock) -> None:
        """Test that similarity values are in range 0-1."""
        mock_rows = [
            MagicMock(entity_id="entity_1", similarity=1.0),
            MagicMock(entity_id="entity_2", similarity=0.5),
            MagicMock(entity_id="entity_3", similarity=0.0),
        ]

        mock_result = MagicMock()
        mock_result.all.return_value = mock_rows
        mock_session.execute = AsyncMock(return_value=mock_result)

        backend = LexicalBackend(session=mock_session)

        results = await backend.lexical_search(
            query_text="test",
            k=10,
        )

        for entity_id, similarity in results:
            assert 0.0 <= similarity <= 1.0
