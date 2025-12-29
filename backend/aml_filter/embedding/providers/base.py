"""Base embedding provider protocol."""

from typing import Protocol, runtime_checkable


@runtime_checkable
class EmbeddingProvider(Protocol):
    """Protocol for embedding providers."""

    model_name: str
    dimension: int

    async def embed(self, text: str) -> list[float]:
        """
        Generate embedding for a single text.

        Args:
            text: Input text to embed

        Returns:
            Embedding vector as list of floats
        """
        ...

    async def embed_batch(self, texts: list[str], batch_size: int = 32) -> list[list[float]]:
        """
        Generate embeddings for multiple texts in batches.

        Args:
            texts: List of input texts to embed
            batch_size: Number of texts to process per batch

        Returns:
            List of embedding vectors
        """
        ...

    def get_model_info(self) -> dict[str, str | int]:
        """
        Get model information.

        Returns:
            Dictionary with model_name, dimension, and other metadata
        """
        ...

