"""Unit tests for embedding service."""

import pytest

from aml_filter.embedding.providers.sentence_transformers import SentenceTransformersProvider
from aml_filter.embedding.service import EmbeddingService


class TestSentenceTransformersProvider:
    """Test SentenceTransformersProvider."""

    @pytest.mark.asyncio
    async def test_provider_initialization(self):
        """Test provider initialization."""
        provider = SentenceTransformersProvider(model_name="sentence-transformers/all-MiniLM-L6-v2")
        assert provider.model_name == "sentence-transformers/all-MiniLM-L6-v2"
        assert provider.dimension > 0  # Will load model to get dimension

    @pytest.mark.asyncio
    async def test_embed_single_text(self):
        """Test embedding a single text."""
        provider = SentenceTransformersProvider(model_name="sentence-transformers/all-MiniLM-L6-v2")
        embedding = await provider.embed("test text")
        assert isinstance(embedding, list)
        assert len(embedding) == provider.dimension
        assert all(isinstance(x, float) for x in embedding)

    @pytest.mark.asyncio
    async def test_embed_batch(self):
        """Test batch embedding."""
        provider = SentenceTransformersProvider(model_name="sentence-transformers/all-MiniLM-L6-v2")
        texts = ["first text", "second text", "third text"]
        embeddings = await provider.embed_batch(texts, batch_size=2)
        assert len(embeddings) == len(texts)
        assert all(len(emb) == provider.dimension for emb in embeddings)

    def test_get_model_info(self):
        """Test getting model info."""
        provider = SentenceTransformersProvider(model_name="sentence-transformers/all-MiniLM-L6-v2")
        info = provider.get_model_info()
        assert "model_name" in info
        assert "dimension" in info
        assert info["model_name"] == "sentence-transformers/all-MiniLM-L6-v2"


class TestEmbeddingService:
    """Test EmbeddingService."""

    @pytest.mark.asyncio
    async def test_service_initialization(self):
        """Test service initialization."""
        service = EmbeddingService()
        assert service.provider is not None
        assert service.enable_cache is True

    @pytest.mark.asyncio
    async def test_embed_with_cache(self):
        """Test embedding with caching."""
        service = EmbeddingService(cache_size=10)
        text = "test text for caching"

        # First call - should compute
        embedding1 = await service.embed(text)
        assert isinstance(embedding1, list)

        # Second call - should use cache
        embedding2 = await service.embed(text)
        assert embedding1 == embedding2

        # Verify cache stats
        stats = service.get_cache_stats()
        assert stats["cache_size"] == 1

    @pytest.mark.asyncio
    async def test_embed_without_cache(self):
        """Test embedding without caching."""
        service = EmbeddingService(enable_cache=False)
        text = "test text"

        embedding = await service.embed(text, use_cache=False)
        assert isinstance(embedding, list)

        stats = service.get_cache_stats()
        assert stats["cache_size"] == 0

    @pytest.mark.asyncio
    async def test_embed_batch_with_cache(self):
        """Test batch embedding with caching."""
        service = EmbeddingService(cache_size=10)
        texts = ["text 1", "text 2", "text 3"]

        # First call
        embeddings1 = await service.embed_batch(texts)
        assert len(embeddings1) == len(texts)

        # Second call - should use cache
        embeddings2 = await service.embed_batch(texts)
        assert embeddings1 == embeddings2

        stats = service.get_cache_stats()
        assert stats["cache_size"] == len(texts)

    @pytest.mark.asyncio
    async def test_cache_lru_eviction(self):
        """Test LRU cache eviction."""
        service = EmbeddingService(cache_size=2)

        # Fill cache
        await service.embed("text1")
        await service.embed("text2")

        stats = service.get_cache_stats()
        assert stats["cache_size"] == 2

        # Add one more - should evict oldest
        await service.embed("text3")
        stats = service.get_cache_stats()
        assert stats["cache_size"] == 2  # Still at max size

    @pytest.mark.asyncio
    async def test_clear_cache(self):
        """Test clearing cache."""
        service = EmbeddingService()
        await service.embed("test text")

        stats = service.get_cache_stats()
        assert stats["cache_size"] > 0

        service.clear_cache()
        stats = service.get_cache_stats()
        assert stats["cache_size"] == 0

    @pytest.mark.asyncio
    async def test_get_model_info(self):
        """Test getting model info from service."""
        service = EmbeddingService()
        info = service.get_model_info()
        assert "model_name" in info
        assert "dimension" in info
