"""Unit tests for PgVectorIndex."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from shared_libs_python import IndexConfig, VectorEmbedding

from aml_filter.db.models import EntityEmbedding
from aml_filter.search.pgvector_index import PgVectorIndex


@pytest.fixture
def mock_session():
    return AsyncMock()


@pytest.fixture
def index_config():
    return IndexConfig(dimension=384, distance_metric="cosine")


@pytest.fixture
def pgvector_index(mock_session, index_config):
    return PgVectorIndex(index_name="test_index", config=index_config, session=mock_session)


@pytest.mark.asyncio
async def test_insert_empty(pgvector_index, mock_session):
    """Test insert with empty list."""
    await pgvector_index.insert([])
    mock_session.execute.assert_not_called()


@pytest.mark.asyncio
async def test_insert_new_and_update(pgvector_index, mock_session):
    """Test insert with mix of new and existing embeddings."""
    embeddings = [
        VectorEmbedding(entity_id="e1", embedding=[0.1] * 384),
        VectorEmbedding(entity_id="e2", embedding=[0.2] * 384),
    ]

    # Mock existing embedding for e1
    existing_emb = MagicMock(spec=EntityEmbedding)
    existing_emb.entity_id = "e1"
    existing_emb.embedding = [0.0] * 384

    mock_result = MagicMock()
    mock_result.scalars().all.return_value = [existing_emb]
    mock_session.execute.return_value = mock_result

    await pgvector_index.insert(embeddings)

    # Check update
    assert existing_emb.embedding == [0.1] * 384

    # Check session.add for e2
    assert mock_session.add.called
    added_obj = mock_session.add.call_args[0][0]
    assert isinstance(added_obj, EntityEmbedding)
    assert added_obj.entity_id == "e2"
    assert added_obj.embedding == [0.2] * 384

    assert mock_session.commit.called


@pytest.mark.asyncio
async def test_search_with_filters(pgvector_index, mock_session):
    """Test search with various filters."""
    query_vector = [0.1] * 384
    k = 5
    filters = {
        "tenant_id": "t1",
        "source_list": "OFAC",
        "risk_category": ["HIGH", "MEDIUM"],
        "entity_type": "INDIVIDUAL",
    }

    mock_result = MagicMock()
    mock_result.all.return_value = [
        MagicMock(entity_id="e1", similarity=0.9),
        MagicMock(entity_id="e2", similarity=0.8),
    ]
    mock_session.execute.return_value = mock_result

    results = await pgvector_index.search(query_vector, k, filters=filters)

    assert len(results) == 2
    assert results[0] == ("e1", pytest.approx(0.1))
    assert results[1] == ("e2", pytest.approx(0.2))

    # Verify filters were applied (basic check that session.execute was called)
    assert mock_session.execute.called


@pytest.mark.asyncio
async def test_search_global_entities(pgvector_index, mock_session):
    """Test search for global entities (tenant_id is None)."""
    query_vector = [0.1] * 384
    filters = {"tenant_id": None}

    mock_result = MagicMock()
    mock_result.all.return_value = []
    mock_session.execute.return_value = mock_result

    await pgvector_index.search(query_vector, k=5, filters=filters)
    assert mock_session.execute.called


@pytest.mark.asyncio
async def test_delete_empty(pgvector_index, mock_session):
    """Test delete with empty list."""
    await pgvector_index.delete([])
    mock_session.execute.assert_not_called()


@pytest.mark.asyncio
async def test_delete_success(pgvector_index, mock_session):
    """Test successful deletion."""
    emb1 = MagicMock(spec=EntityEmbedding)
    mock_result = MagicMock()
    mock_result.scalars().all.return_value = [emb1]
    mock_session.execute.return_value = mock_result

    await pgvector_index.delete(["e1"])

    assert mock_session.delete.called
    assert mock_session.commit.called


@pytest.mark.asyncio
async def test_get_stats(pgvector_index, mock_session):
    """Test get_stats with various size formats."""
    # Test MB
    mock_session.execute.side_effect = [
        MagicMock(scalar=lambda: 100),  # count
        MagicMock(scalar=lambda: "50.5 MB"),  # size
    ]
    stats = await pgvector_index.get_stats()
    assert stats.vector_count == 100
    assert stats.index_size_mb == 50.5

    # Test GB
    mock_session.execute.side_effect = [
        MagicMock(scalar=lambda: 100),
        MagicMock(scalar=lambda: "1.5 GB"),
    ]
    stats = await pgvector_index.get_stats()
    assert stats.index_size_mb == 1.5 * 1024

    # Test KB
    mock_session.execute.side_effect = [
        MagicMock(scalar=lambda: 100),
        MagicMock(scalar=lambda: "1024 KB"),
    ]
    stats = await pgvector_index.get_stats()
    assert stats.index_size_mb == 1.0


@pytest.mark.asyncio
async def test_rebuild_not_implemented(pgvector_index):
    """Test rebuild raises NotImplementedError."""
    with pytest.raises(NotImplementedError):
        await pgvector_index.rebuild()
