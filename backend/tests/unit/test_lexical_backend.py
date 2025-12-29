"""Unit tests for lexical search backend."""

import pytest
from aml_filter.search.lexical_backend import LexicalBackend

@pytest.mark.unit
class TestLexicalBackend:
    """Test lexical search backend."""

    async def test_lexical_backend_initialization(self, session):
        """Test that lexical backend initializes correctly."""
        backend = LexicalBackend(session=session)
        assert backend.session == session
