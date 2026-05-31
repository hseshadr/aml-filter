"""PgVector search backend implementation."""

from collections.abc import Sequence

from shared_libs_python import GlobalPartitionStrategy, IndexConfig, IndexManager, VectorEmbedding
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.domain.search import SearchFilters
from aml_filter.embedding import EMBEDDING_DIM
from aml_filter.search.pgvector_index import PgVectorIndex
from aml_filter.types import JsonObject


def _to_index_filters(filters: SearchFilters | None) -> dict[str, Sequence[str]]:
    """Translate domain SearchFilters into the IndexManager metadata-filter dict."""
    if not filters:
        return {}
    mapping: list[tuple[str, Sequence[str] | None]] = [
        ("source_list", filters.source_lists),
        ("risk_category", filters.risk_categories),
        ("entity_type", filters.entity_types),
    ]
    return {key: values for key, values in mapping if values}


class PgVectorBackend:
    """PgVector-based vector search backend."""

    def __init__(
        self,
        session: AsyncSession,
        index_config: IndexConfig | None = None,
    ) -> None:
        """
        Initialize PgVector backend.

        Args:
            session: Async SQLAlchemy session
            index_config: Optional index configuration (defaults to standard HNSW config)
        """
        self.session = session
        self.index_config = index_config or IndexConfig(
            m=32,
            ef_construction=200,
            ef_search=100,
            dimension=EMBEDDING_DIM,
        )

        # Create index factory function
        async def create_pgvector_index(
            name: str, config: IndexConfig | None = None
        ) -> PgVectorIndex:
            """Factory function to create PgVectorIndex instances."""
            return PgVectorIndex(
                index_name=name,
                config=config or self.index_config,
                session=self.session,
            )

        # Set up GlobalPartitionStrategy (single global index with metadata filtering)
        strategy = GlobalPartitionStrategy(
            index_factory=create_pgvector_index,
            index_name="entity_embeddings_global",
            config=self.index_config,
            partition_key_name="tenant_id",
        )

        # Create IndexManager
        self.index_manager = IndexManager(
            partition_strategy=strategy,
            default_config=self.index_config,
            partition_key_name="tenant_id",
        )

    async def vector_search(
        self,
        query_vector: list[float],
        k: int,
        tenant_id: str | None = None,
        filters: SearchFilters | None = None,
        ef_search: int | None = None,
    ) -> list[tuple[str, float]]:
        """
        Perform vector similarity search.

        Args:
            query_vector: Query embedding vector
            k: Number of results to return
            tenant_id: Optional tenant ID for filtering
            filters: Optional search filters
            ef_search: Optional HNSW ef_search parameter override

        Returns:
            List of (entity_id, distance) tuples, sorted by distance (ascending)
        """
        results: list[tuple[str, float]] = await self.index_manager.search(
            query_vector=query_vector,
            k=k,
            partition_key=tenant_id,
            # Legacy path: aml uses list-valued IN filters, which are wider than the
            # shared-libs ``Metadata`` (scalar-only) type. The pgvector index handles them.
            filters=_to_index_filters(filters),  # type: ignore[arg-type]
            ef_search=ef_search or self.index_config.ef_search,
        )
        return results

    async def insert_embeddings(
        self,
        embeddings: list[VectorEmbedding],
        tenant_id: str | None = None,
    ) -> None:
        """
        Insert embeddings into the index.

        Args:
            embeddings: List of embeddings to insert
            tenant_id: Optional tenant ID for partitioning
        """
        await self.index_manager.insert(embeddings=embeddings, partition_key=tenant_id)

    async def delete_embeddings(
        self,
        entity_ids: list[str],
        tenant_id: str | None = None,
    ) -> None:
        """
        Delete embeddings by entity_id.

        Args:
            entity_ids: List of entity IDs to delete
            tenant_id: Optional tenant ID (for validation)
        """
        await self.index_manager.delete(entity_ids=entity_ids, partition_key=tenant_id)

    async def get_index_stats(self) -> JsonObject:
        """
        Get index statistics.

        Returns:
            Dictionary with index statistics
        """
        # Get stats from the global index
        index = await self.index_manager.partition_strategy.get_index("entity_embeddings_global")
        stats = await index.get_stats()
        return {
            "index_name": stats.index_name,
            "vector_count": stats.vector_count,
            "index_size_mb": stats.index_size_mb,
            "tombstone_count": stats.tombstone_count,
            "tombstone_percentage": stats.tombstone_percentage,
        }
