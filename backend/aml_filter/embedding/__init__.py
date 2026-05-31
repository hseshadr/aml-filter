"""Embedding providers and services."""

from aml_filter.embedding.providers import EmbeddingProvider, SentenceTransformersProvider
from aml_filter.embedding.service import EmbeddingService

#: Dimensionality of ``all-MiniLM-L6-v2`` — the model every embedding path uses.
#: Pinned here as the single source of truth for index/column dimensions (the
#: ``EntityEmbedding.embedding`` column is ``Vector(384)`` and FAISS indexes match).
EMBEDDING_DIM = 384

__all__ = ["EMBEDDING_DIM", "EmbeddingProvider", "EmbeddingService", "SentenceTransformersProvider"]
