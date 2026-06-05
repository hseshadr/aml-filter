"""Unit tests for the embedding provider wrapper and service.

These run fully offline: the autouse `_offline_embedder` fixture (see
`tests/unit/conftest.py`) patches the heavy `SentenceTransformer` class with a
deterministic stub, so `SentenceTransformersProvider`'s wrapper code is exercised
without downloading a model. Service-logic tests inject a typed `FakeEmbeddingProvider`
so they assert caching/batching behavior, not the model.
"""

import pytest

from aml_filter.embedding.providers.sentence_transformers import SentenceTransformersProvider
from aml_filter.embedding.service import EmbeddingService
from tests.unit.conftest import EMBEDDING_DIM, FakeEmbeddingProvider


class TestSentenceTransformersProvider:
    """The provider wrapper around the (stubbed) SentenceTransformer model."""

    @pytest.mark.asyncio
    async def test_provider_initialization(self) -> None:
        provider = SentenceTransformersProvider(model_name="sentence-transformers/all-MiniLM-L6-v2")
        assert provider.model_name == "sentence-transformers/all-MiniLM-L6-v2"
        assert provider.dimension == EMBEDDING_DIM

    @pytest.mark.asyncio
    async def test_embed_single_text(self) -> None:
        provider = SentenceTransformersProvider(model_name="sentence-transformers/all-MiniLM-L6-v2")
        embedding = await provider.embed("test text")
        assert isinstance(embedding, list)
        assert len(embedding) == provider.dimension
        assert all(isinstance(x, float) for x in embedding)

    @pytest.mark.asyncio
    async def test_embed_batch(self) -> None:
        provider = SentenceTransformersProvider(model_name="sentence-transformers/all-MiniLM-L6-v2")
        texts = ["first text", "second text", "third text"]
        embeddings = await provider.embed_batch(texts, batch_size=2)
        assert len(embeddings) == len(texts)
        assert all(len(emb) == provider.dimension for emb in embeddings)

    def test_get_model_info(self) -> None:
        provider = SentenceTransformersProvider(model_name="sentence-transformers/all-MiniLM-L6-v2")
        info = provider.get_model_info()
        assert info["model_name"] == "sentence-transformers/all-MiniLM-L6-v2"
        assert info["dimension"] == EMBEDDING_DIM


class TestEmbeddingService:
    """Service caching/batching logic over a deterministic fake provider."""

    @pytest.mark.asyncio
    async def test_service_initialization(self) -> None:
        service = EmbeddingService(provider=FakeEmbeddingProvider())
        assert service.provider is not None
        assert service.enable_cache is True

    @pytest.mark.asyncio
    async def test_embed_with_cache(self) -> None:
        service = EmbeddingService(provider=FakeEmbeddingProvider(), cache_size=10)
        text = "test text for caching"

        embedding1 = await service.embed(text)
        embedding2 = await service.embed(text)

        assert isinstance(embedding1, list)
        assert embedding1 == embedding2
        assert service.get_cache_stats()["cache_size"] == 1

    @pytest.mark.asyncio
    async def test_embed_without_cache(self) -> None:
        service = EmbeddingService(provider=FakeEmbeddingProvider(), enable_cache=False)

        embedding = await service.embed("test text", use_cache=False)

        assert isinstance(embedding, list)
        assert service.get_cache_stats()["cache_size"] == 0

    @pytest.mark.asyncio
    async def test_embed_batch_with_cache(self) -> None:
        service = EmbeddingService(provider=FakeEmbeddingProvider(), cache_size=10)
        texts = ["text 1", "text 2", "text 3"]

        embeddings1 = await service.embed_batch(texts)
        embeddings2 = await service.embed_batch(texts)

        assert len(embeddings1) == len(texts)
        assert embeddings1 == embeddings2
        assert service.get_cache_stats()["cache_size"] == len(texts)

    @pytest.mark.asyncio
    async def test_cache_lru_eviction(self) -> None:
        service = EmbeddingService(provider=FakeEmbeddingProvider(), cache_size=2)

        await service.embed("text1")
        await service.embed("text2")
        assert service.get_cache_stats()["cache_size"] == 2

        await service.embed("text3")
        assert service.get_cache_stats()["cache_size"] == 2  # still at max size

    @pytest.mark.asyncio
    async def test_clear_cache(self) -> None:
        service = EmbeddingService(provider=FakeEmbeddingProvider())
        await service.embed("test text")
        assert service.get_cache_stats()["cache_size"] > 0

        service.clear_cache()
        assert service.get_cache_stats()["cache_size"] == 0

    @pytest.mark.asyncio
    async def test_get_model_info(self) -> None:
        service = EmbeddingService(provider=FakeEmbeddingProvider())
        info = service.get_model_info()
        assert info["model_name"] == "fake-provider"
        assert info["dimension"] == EMBEDDING_DIM
