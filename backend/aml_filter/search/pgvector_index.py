"""PgVector index implementation for shared-libs-python."""

from typing import cast

from shared_libs_python import IndexConfig, IndexStats, VectorEmbedding
from shared_libs_python.vector_mgmt.core.types import Metadata
from sqlalchemy import Select, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from aml_filter.db.models import Entity, EntityEmbedding

# aml passes list-valued IN filters (e.g. source_list=["OFAC_SDN", "EU"]), which are
# wider than the shared-libs ``Metadata`` (scalar-only) Protocol type. This alias names
# that real, wider runtime shape used by the SQL-building helpers below.
_PgFilters = dict[str, str | list[str] | None]


class PgVectorIndex:
    """Legacy pgvector implementation of the shared-libs ``VectorIndex`` Protocol.

    Superseded by :class:`~aml_filter.search.localvec_backend.LocalVecBackend` for
    retrieval; retained for the IndexManager/partition-strategy plumbing and tests.
    """

    def __init__(
        self,
        index_name: str,
        config: IndexConfig,
        session: AsyncSession,
    ) -> None:
        """
        Initialize PgVector index.

        Args:
            index_name: Name of the index (for reference, actual index is on table)
            config: Index configuration
            session: Async SQLAlchemy session
        """
        self.index_name = index_name
        self.config = config
        self.session = session

    async def insert(self, embeddings: list[VectorEmbedding]) -> None:
        """Insert embeddings into database."""
        if not embeddings:
            return

        # Get existing embeddings to update or insert
        entity_ids = [emb.entity_id for emb in embeddings]
        stmt = select(EntityEmbedding).where(EntityEmbedding.entity_id.in_(entity_ids))
        result = await self.session.execute(stmt)
        existing = {row.entity_id: row for row in result.scalars().all()}

        for emb in embeddings:
            self._upsert_embedding(emb, existing)

        await self.session.commit()

    def _upsert_embedding(self, emb: VectorEmbedding, existing: dict[str, EntityEmbedding]) -> None:
        """Update an existing row's vector, or add a new EntityEmbedding."""
        if emb.entity_id in existing:
            existing[emb.entity_id].embedding = emb.embedding
            return
        self.session.add(
            EntityEmbedding(
                entity_id=emb.entity_id,
                embedding=emb.embedding,
                embedding_model="sentence-transformers",
                model_version="default",
            )
        )

    async def search(
        self,
        query_vector: list[float],
        k: int,
        filters: Metadata | None = None,
        ef_search: int | None = None,
    ) -> list[tuple[str, float]]:
        """
        Search for nearest neighbors using pgvector.

        Args:
            query_vector: Query embedding vector
            k: Number of results to return
            filters: Optional filters (tenant_id, source_list, risk_category, etc.)
            ef_search: HNSW ef_search parameter (if supported by pgvector)

        Returns:
            List of (entity_id, distance) tuples, sorted by distance (ascending)
        """
        # pgvector has no per-query ef_search yet; accepted for protocol conformance.
        del ef_search
        stmt = (
            select(
                EntityEmbedding.entity_id,
                (1 - EntityEmbedding.embedding.cosine_distance(query_vector)).label("similarity"),
            )
            .where(EntityEmbedding.embedding.isnot(None))
            .order_by(EntityEmbedding.embedding.cosine_distance(query_vector))
            .limit(k)
        )

        if filters:
            # aml supplies list-valued IN filters at runtime; recover that wider shape.
            stmt = self._apply_filters(stmt, cast(_PgFilters, filters))

        result = await self.session.execute(stmt)
        rows = result.all()

        # Convert similarity to distance (1 - similarity = distance)
        # Return as (entity_id, distance) where distance is 1 - similarity
        return [(row.entity_id, 1.0 - row.similarity) for row in rows]

    def _apply_filters(
        self, stmt: Select[tuple[str, float]], filters: _PgFilters
    ) -> Select[tuple[str, float]]:
        """Join Entity and narrow `stmt` by the supported filter keys."""
        stmt = stmt.join(Entity, EntityEmbedding.entity_id == Entity.entity_id)
        if "tenant_id" in filters:
            stmt = self._apply_tenant_filter(stmt, filters["tenant_id"])
        stmt = self._apply_in_filter(stmt, Entity.source_list, filters, "source_list")
        stmt = self._apply_in_filter(stmt, Entity.risk_category, filters, "risk_category")
        return self._apply_in_filter(stmt, Entity.entity_type, filters, "entity_type")

    @staticmethod
    def _apply_tenant_filter(
        stmt: Select[tuple[str, float]], tenant_id: str | list[str] | None
    ) -> Select[tuple[str, float]]:
        """Restrict to global entities (None) or tenant-specific plus global."""
        if tenant_id is None:
            return stmt.where(Entity.tenant_id.is_(None))
        return stmt.where((Entity.tenant_id == tenant_id) | (Entity.tenant_id.is_(None)))

    @staticmethod
    def _apply_in_filter(
        stmt: Select[tuple[str, float]],
        column: InstrumentedAttribute[str | None],
        filters: _PgFilters,
        key: str,
    ) -> Select[tuple[str, float]]:
        """Apply an equality (scalar) or IN (list) filter for `key`, if present."""
        if key not in filters:
            return stmt
        value = filters[key]
        if isinstance(value, list):
            return stmt.where(column.in_(value))
        return stmt.where(column == value)

    async def delete(self, entity_ids: list[str]) -> None:
        """Delete embeddings by entity_id."""
        if not entity_ids:
            return

        stmt = select(EntityEmbedding).where(EntityEmbedding.entity_id.in_(entity_ids))
        result = await self.session.execute(stmt)
        embeddings = result.scalars().all()

        for emb in embeddings:
            await self.session.delete(emb)

        await self.session.commit()

    async def get_stats(self) -> IndexStats:
        """Get index statistics."""
        # Count total embeddings
        count_stmt = select(text("COUNT(*)")).select_from(EntityEmbedding)
        result = await self.session.execute(count_stmt)
        vector_count = result.scalar() or 0

        # Get index size (approximate)
        size_stmt = text(
            """
            SELECT pg_size_pretty(pg_total_relation_size('entity_embeddings'))::text
        """
        )
        result = await self.session.execute(size_stmt)
        size_str = result.scalar() or "0 MB"

        return IndexStats(
            index_name=self.index_name,
            vector_count=vector_count,
            index_size_mb=self._size_to_mb(size_str),
        )

    @staticmethod
    def _size_to_mb(size_str: str) -> float:
        """Convert a `pg_size_pretty` string (KB/MB/GB) into megabytes."""
        if "MB" in size_str:
            return float(size_str.replace(" MB", ""))
        if "GB" in size_str:
            return float(size_str.replace(" GB", "")) * 1024
        if "KB" in size_str:
            return float(size_str.replace(" KB", "")) / 1024
        return 0.0

    async def rebuild(self, config: IndexConfig | None = None) -> None:
        """
        Rebuild index with optional new configuration.

        Note: pgvector doesn't support online index rebuild with new parameters.
        This would require dropping and recreating the index.
        """
        if config:
            self.config = config

        # For now, just log that rebuild was requested
        # Actual rebuild would require:
        # 1. Create new index with new config
        # 2. Populate from existing data
        # 3. Drop old index
        # 4. Rename new index
        # This should be done via Alembic migration for safety
        raise NotImplementedError(
            "Index rebuild requires migration. Use Alembic to recreate index with new parameters."
        )
