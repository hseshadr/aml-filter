"""Embedding service with caching."""

from hashlib import sha256
from typing import Any

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

    async def embed(self, text: str, use_cache: bool = True) -> list[float]:
        """
        Generate embedding for a single text with optional caching.

        Args:
            text: Input text to embed
            use_cache: Whether to use cache (if enabled)

        Returns:
            Embedding vector
        """
        if self.enable_cache and use_cache:
            cache_key = self._get_cache_key(text)
            if cache_key in self._cache:
                return self._cache[cache_key]

        embedding = await self.provider.embed(text)

        if self.enable_cache and use_cache:
            cache_key = self._get_cache_key(text)
            # Simple LRU: remove oldest if cache is full
            if len(self._cache) >= self._cache_size:
                # Remove first item (FIFO approximation)
                first_key = next(iter(self._cache))
                del self._cache[first_key]
            self._cache[cache_key] = embedding

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

        if not self.enable_cache or not use_cache:
            return await self.provider.embed_batch(texts, batch_size=batch_size)

        # Check cache for each text
        cached: dict[int, list[float]] = {}
        to_embed: list[tuple[int, str]] = []

        for i, text in enumerate(texts):
            cache_key = self._get_cache_key(text)
            if cache_key in self._cache:
                cached[i] = self._cache[cache_key]
            else:
                to_embed.append((i, text))

        # Embed uncached texts
        if to_embed:
            texts_to_embed = [text for _, text in to_embed]
            embeddings = await self.provider.embed_batch(
                texts_to_embed, batch_size=batch_size
            )

            # Store in cache and map back to original indices
            for (orig_idx, text), embedding in zip(to_embed, embeddings, strict=False):
                cache_key = self._get_cache_key(text)
                # Simple LRU: remove oldest if cache is full
                if len(self._cache) >= self._cache_size:
                    first_key = next(iter(self._cache))
                    del self._cache[first_key]
                self._cache[cache_key] = embedding
                cached[orig_idx] = embedding

        # Reconstruct results in original order
        return [cached[i] for i in range(len(texts))]

    def clear_cache(self) -> None:
        """Clear the embedding cache."""
        self._cache.clear()

    def get_cache_stats(self) -> dict[str, Any]:
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

    def get_model_info(self) -> dict[str, Any]:
        """
        Get model information.

        Returns:
            Dictionary with model information
        """
        return self.provider.get_model_info()

