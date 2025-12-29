"""Unit tests for hybrid search service."""

import pytest
from aml_filter.search.hybrid_search import HybridSearchService

@pytest.mark.unit
class TestHybridSearch:
    """Test hybrid search logic."""

    async def test_hybrid_service_initialization(self, session):
        """Test that hybrid search service initializes correctly."""
        service = HybridSearchService(session=session)
        assert service.session == session
        assert service.lexical_backend is not None
        assert service.vector_backend is not None
