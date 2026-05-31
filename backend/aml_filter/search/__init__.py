"""Search backends (vector + lexical)."""

from aml_filter.search.hybrid_search import HybridSearchService, VectorBackend
from aml_filter.search.lexical_backend import LexicalBackend
from aml_filter.search.localvec_backend import EntityVector, LocalVecBackend
from aml_filter.search.pgvector_backend import PgVectorBackend
from aml_filter.search.pgvector_index import PgVectorIndex
from aml_filter.search.service import SearchService

__all__ = [
    "EntityVector",
    "HybridSearchService",
    "LexicalBackend",
    "LocalVecBackend",
    "PgVectorBackend",
    "PgVectorIndex",
    "SearchService",
    "VectorBackend",
]
