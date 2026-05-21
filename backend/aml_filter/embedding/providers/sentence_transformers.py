"""SentenceTransformers embedding provider."""

import asyncio
from typing import Any

from sentence_transformers import SentenceTransformer


class SentenceTransformersProvider:
    """SentenceTransformers-based embedding provider."""

    def __init__(
        self,
        model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
        device: str | None = None,
        **kwargs: Any,
    ) -> None:
        """
        Initialize SentenceTransformers provider.

        Args:
            model_name: HuggingFace model name or path
            device: Device to run on ('cpu', 'cuda', etc.). Auto-detected if None.
            **kwargs: Additional arguments passed to SentenceTransformer
        """
        self.model_name = model_name
        self._model: SentenceTransformer | None = None
        self._device = device
        self._kwargs = kwargs
        self._dimension: int | None = None

    @property
    def model(self) -> SentenceTransformer:
        """Lazy load the model."""
        if self._model is None:
            self._model = SentenceTransformer(self.model_name, device=self._device, **self._kwargs)
            # Get dimension from model
            self._dimension = self._model.get_sentence_embedding_dimension()
        return self._model

    @property
    def dimension(self) -> int:
        """Get embedding dimension."""
        _ = self.model  # triggers lazy load which sets self._dimension
        if self._dimension is None:
            raise RuntimeError("Model dimension not available after load")
        return self._dimension

    async def embed(self, text: str) -> list[float]:
        """
        Generate embedding for a single text.

        Args:
            text: Input text to embed

        Returns:
            Embedding vector as list of floats
        """
        loop = asyncio.get_event_loop()
        embedding = await loop.run_in_executor(None, self.model.encode, text)
        return embedding.tolist()

    async def embed_batch(self, texts: list[str], batch_size: int = 32) -> list[list[float]]:
        """
        Generate embeddings for multiple texts in batches.

        Args:
            texts: List of input texts to embed
            batch_size: Number of texts to process per batch

        Returns:
            List of embedding vectors
        """
        if not texts:
            return []

        loop = asyncio.get_event_loop()

        # Process in batches
        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]

            def encode_batch(b: list[str] = batch) -> Any:
                return self.model.encode(b, batch_size=len(b), show_progress_bar=False)

            embeddings = await loop.run_in_executor(None, encode_batch)
            all_embeddings.extend(emb.tolist() for emb in embeddings)

        return all_embeddings

    def get_model_info(self) -> dict[str, str | int]:
        """
        Get model information.

        Returns:
            Dictionary with model_name, dimension, and other metadata
        """
        return {
            "model_name": self.model_name,
            "dimension": self.dimension,
            "device": str(self.model.device) if self._model else "not_loaded",
        }
