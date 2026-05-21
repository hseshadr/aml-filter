"""Embedding provider implementations."""

from aml_filter.embedding.providers.base import EmbeddingProvider
from aml_filter.embedding.providers.sentence_transformers import SentenceTransformersProvider

__all__ = ["EmbeddingProvider", "SentenceTransformersProvider"]
