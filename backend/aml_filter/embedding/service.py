"""Embedding service with caching."""

from hashlib import sha256

from aml_filter.embedding.providers.base import EmbeddingProvider
from aml_filter.embedding.providers.sentence_transformers import SentenceTransformersProvider


class EmbeddingService:
    """Embedding service with caching and provider management."""

    def __init__(
        self,
        provider: EmbeddingProvider | None = None,
        cache_size: int = 1000,
        enable_cache: bool = True,
    ) -> None:
        """
        Initialize embedding service.

        Args:
            provider: Embedding provider instance (defaults to SentenceTransformersProvider)
            cache_size: Maximum number of cached embeddings
            enable_cache: Whether to enable caching
        """
        self.provider = provider or SentenceTransformersProvider()
        self.enable_cache = enable_cache
        self._cache: dict[str, list[float]] = {}
        self._cache_size = cache_size

    def _get_cache_key(self, text: str) -> str:
        """Generate cache key for text."""
        return sha256(text.encode("utf-8")).hexdigest()

    def _caching_active(self, use_cache: bool) -> bool:
        """True when both the service and this call opt into caching."""
        return self.enable_cache and use_cache

    def _cache_put(self, text: str, embedding: list[float]) -> None:
        """Store an embedding, evicting the oldest entry (FIFO) when full."""
        if len(self._cache) >= self._cache_size:
            del self._cache[next(iter(self._cache))]
        self._cache[self._get_cache_key(text)] = embedding

    async def embed(self, text: str, use_cache: bool = True) -> list[float]:
        """
        Generate embedding for a single text with optional caching.

        Args:
            text: Input text to embed
            use_cache: Whether to use cache (if enabled)

        Returns:
            Embedding vector
        """
        active = self._caching_active(use_cache)
        if active and (cached := self._cache.get(self._get_cache_key(text))) is not None:
            return cached
        embedding = await self.provider.embed(text)
        if active:
            self._cache_put(text, embedding)
        return embedding

    async def embed_batch(
        self, texts: list[str], batch_size: int = 32, use_cache: bool = True
    ) -> list[list[float]]:
        """
        Generate embeddings for multiple texts with caching.

        Args:
            texts: List of input texts to embed
            batch_size: Number of texts to process per batch
            use_cache: Whether to use cache (if enabled)

        Returns:
            List of embedding vectors
        """
        if not texts:
            return []
        if not self._caching_active(use_cache):
            return await self.provider.embed_batch(texts, batch_size=batch_size)

        cached, to_embed = self._partition_cached(texts)
        if to_embed:
            await self._embed_and_cache(to_embed, cached, batch_size)
        return [cached[i] for i in range(len(texts))]

    def _partition_cached(
        self, texts: list[str]
    ) -> tuple[dict[int, list[float]], list[tuple[int, str]]]:
        """Split texts into already-cached (by index) and still-to-embed (index, text)."""
        cached: dict[int, list[float]] = {}
        to_embed: list[tuple[int, str]] = []
        for i, text in enumerate(texts):
            hit = self._cache.get(self._get_cache_key(text))
            if hit is not None:
                cached[i] = hit
            else:
                to_embed.append((i, text))
        return cached, to_embed

    async def _embed_and_cache(
        self,
        to_embed: list[tuple[int, str]],
        cached: dict[int, list[float]],
        batch_size: int,
    ) -> None:
        """Embed the uncached texts, store them, and fill `cached` by original index."""
        embeddings = await self.provider.embed_batch(
            [text for _, text in to_embed], batch_size=batch_size
        )
        for (orig_idx, text), embedding in zip(to_embed, embeddings, strict=False):
            self._cache_put(text, embedding)
            cached[orig_idx] = embedding

    def clear_cache(self) -> None:
        """Clear the embedding cache."""
        self._cache.clear()

    def get_cache_stats(self) -> dict[str, int | bool]:
        """
        Get cache statistics.

        Returns:
            Dictionary with cache size and hit rate info
        """
        return {
            "cache_size": len(self._cache),
            "max_cache_size": self._cache_size,
            "cache_enabled": self.enable_cache,
        }

    def get_model_info(self) -> dict[str, str | int]:
        """
        Get model information.

        Returns:
            Dictionary with model information
        """
        return self.provider.get_model_info()
