"""Unit tests for pgvector search backend."""

import pytest
from aml_filter.search.pgvector_backend import PgVectorBackend

@pytest.mark.unit
class TestPgVectorBackend:
    """Test pgvector search backend."""

    async def test_pgvector_backend_initialization(self, session):
        """Test that pgvector backend initializes correctly."""
        backend = PgVectorBackend(session=session)
        assert backend.session == session
