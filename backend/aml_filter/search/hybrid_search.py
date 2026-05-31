"""Hybrid search service combining vector and lexical search."""

from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.domain.search import CandidateScores, SearchCandidate, SearchFilters
from aml_filter.search.lexical_backend import LexicalBackend
from aml_filter.search.pgvector_backend import PgVectorBackend


def _classify_candidate(vector_score: float | None, lexical_score: float | None) -> CandidateScores:
    """Build per-candidate scores, tagging which backend(s) produced a hit."""
    if vector_score is not None and lexical_score is not None:
        source: Literal["vector", "lexical", "both"] = "both"
    elif vector_score is not None:
        source = "vector"
    else:
        source = "lexical"
    return CandidateScores(vector_score=vector_score, lexical_score=lexical_score, source=source)


class HybridSearchService:
    """Hybrid search service combining vector and lexical search."""

    def __init__(
        self,
        session: AsyncSession,
        vector_backend: PgVectorBackend | None = None,
        lexical_backend: LexicalBackend | None = None,
    ) -> None:
        """
        Initialize hybrid search service.

        Args:
            session: Async SQLAlchemy session
            vector_backend: Optional pre-initialized vector backend
            lexical_backend: Optional pre-initialized lexical backend
        """
        self.session = session
        self.vector_backend = vector_backend or PgVectorBackend(session=session)
        self.lexical_backend = lexical_backend or LexicalBackend(session=session)

    async def search(
        self,
        query_vector: list[float],
        query_text: str,
        k: int = 50,
        tenant_id: str | None = None,
        filters: SearchFilters | None = None,
        ef_search: int | None = None,
        similarity_threshold: float = 0.3,
    ) -> list[SearchCandidate]:
        """
        Perform hybrid search combining vector and lexical search.

        Args:
            query_vector: Query embedding vector
            query_text: Normalized query text for lexical search
            k: Number of candidates to return (before scoring)
            tenant_id: Optional tenant ID for filtering
            filters: Optional search filters
            ef_search: Optional HNSW ef_search parameter
            similarity_threshold: Minimum similarity threshold for lexical search

        Returns:
            List of (entity_id, max_score, metadata) tuples where metadata contains:
            - vector_score: Similarity from vector search (0-1, where 1 is most similar)
            - lexical_score: Similarity from lexical search (0-1, where 1 is most similar)
            - source: "vector", "lexical", or "both"
        """
        # Run vector and lexical search sequentially
        # Note: asyncio.gather with a single DB session causes InterfaceError in asyncpg
        vector_results = await self.vector_backend.vector_search(
            query_vector=query_vector,
            k=k,
            tenant_id=tenant_id,
            filters=filters,
            ef_search=ef_search,
        )

        lexical_results = await self.lexical_backend.combined_lexical_search(
            query_text=query_text,
            k=k,
            tenant_id=tenant_id,
            filters=filters,
            similarity_threshold=similarity_threshold,
        )

        # Convert vector results: (entity_id, distance) -> (entity_id, similarity)
        # Note: distance is 0-1 where 0 is most similar, similarity is 0-1 where 1 is most similar
        vector_similarities: dict[str, float] = {}
        for entity_id, distance in vector_results:
            # Convert distance to similarity: similarity = 1 - distance
            similarity = 1.0 - distance
            vector_similarities[entity_id] = similarity

        # Convert lexical results: already in (entity_id, similarity) format
        lexical_similarities: dict[str, float] = dict(lexical_results)

        # Merge results: union of both result sets
        all_entity_ids = set(vector_similarities.keys()) | set(lexical_similarities.keys())

        # Build merged results with metadata
        merged_results: list[SearchCandidate] = []
        for entity_id in all_entity_ids:
            vector_score = vector_similarities.get(entity_id)
            lexical_score = lexical_similarities.get(entity_id)
            scores = _classify_candidate(vector_score, lexical_score)
            max_score = max(s for s in (vector_score, lexical_score) if s is not None)
            merged_results.append((entity_id, max_score, scores))

        # Sort by max_score (descending) and return top K
        merged_results.sort(key=lambda x: x[1], reverse=True)
        return merged_results[:k]

    async def search_candidates(
        self,
        query_vector: list[float],
        query_text: str,
        k: int = 50,
        tenant_id: str | None = None,
        filters: SearchFilters | None = None,
        ef_search: int | None = None,
        similarity_threshold: float = 0.3,
    ) -> list[str]:
        """
        Get candidate entity IDs from hybrid search (for scoring phase).

        This is a convenience method that returns just the entity IDs,
        which can then be loaded and scored separately.

        Args:
            query_vector: Query embedding vector
            query_text: Normalized query text
            k: Number of candidates to return
            tenant_id: Optional tenant ID
            filters: Optional search filters
            ef_search: Optional HNSW ef_search parameter
            similarity_threshold: Minimum similarity threshold

        Returns:
            List of entity IDs (deduplicated, sorted by relevance)
        """
        results = await self.search(
            query_vector=query_vector,
            query_text=query_text,
            k=k,
            tenant_id=tenant_id,
            filters=filters,
            ef_search=ef_search,
            similarity_threshold=similarity_threshold,
        )

        # Return just the entity IDs
        return [entity_id for entity_id, _, _ in results]
