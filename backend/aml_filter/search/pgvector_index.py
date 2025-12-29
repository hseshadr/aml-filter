"""PgVector index implementation for shared-libs-python."""

from typing import Any

from shared_libs_python.core.types import IndexConfig, IndexStats, VectorEmbedding, VectorIndex
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import EntityEmbedding


class PgVectorIndex(VectorIndex):  # type: ignore[misc]
    """PgVector implementation of VectorIndex protocol."""

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
            if emb.entity_id in existing:
                # Update existing embedding
                existing[emb.entity_id].embedding = emb.embedding
            else:
                # Insert new embedding
                db_embedding = EntityEmbedding(
                    entity_id=emb.entity_id,
                    embedding=emb.embedding,
                    embedding_model="sentence-transformers",
                    model_version="default",
                )
                self.session.add(db_embedding)

        await self.session.commit()

    async def search(
        self,
        query_vector: list[float],
        k: int,
        filters: dict[str, Any] | None = None,
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
        # Build query with cosine distance
        stmt = (
            select(
                EntityEmbedding.entity_id,
                (1 - EntityEmbedding.embedding.cosine_distance(query_vector)).label("similarity"),
            )
            .where(EntityEmbedding.embedding.isnot(None))
            .order_by(EntityEmbedding.embedding.cosine_distance(query_vector))
            .limit(k)
        )

        # Apply filters if provided
        if filters:
            # Join with Entity table for filtering
            from aml_filter.db.models import Entity

            stmt = stmt.join(Entity, EntityEmbedding.entity_id == Entity.entity_id)

            if "tenant_id" in filters:
                tenant_id = filters["tenant_id"]
                if tenant_id is None:
                    # Include only global entities (tenant_id IS NULL)
                    stmt = stmt.where(Entity.tenant_id.is_(None))
                else:
                    # Include both tenant-specific and global entities
                    stmt = stmt.where(
                        (Entity.tenant_id == tenant_id) | (Entity.tenant_id.is_(None))
                    )

            if "source_list" in filters:
                source_lists = filters["source_list"]
                if isinstance(source_lists, list):
                    stmt = stmt.where(Entity.source_list.in_(source_lists))
                else:
                    stmt = stmt.where(Entity.source_list == source_lists)

            if "risk_category" in filters:
                risk_categories = filters["risk_category"]
                if isinstance(risk_categories, list):
                    stmt = stmt.where(Entity.risk_category.in_(risk_categories))
                else:
                    stmt = stmt.where(Entity.risk_category == risk_categories)

            if "entity_type" in filters:
                entity_types = filters["entity_type"]
                if isinstance(entity_types, list):
                    stmt = stmt.where(Entity.entity_type.in_(entity_types))
                else:
                    stmt = stmt.where(Entity.entity_type == entity_types)

        # Set ef_search if supported (pgvector 0.2.4+)
        if ef_search is not None:
            # Note: pgvector doesn't support per-query ef_search yet
            # This would require index-level configuration
            pass

        result = await self.session.execute(stmt)
        rows = result.all()

        # Convert similarity to distance (1 - similarity = distance)
        # Return as (entity_id, distance) where distance is 1 - similarity
        return [(row.entity_id, 1.0 - row.similarity) for row in rows]

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

        # Parse size to MB
        size_mb = 0.0
        if "MB" in size_str:
            size_mb = float(size_str.replace(" MB", ""))
        elif "GB" in size_str:
            size_mb = float(size_str.replace(" GB", "")) * 1024
        elif "KB" in size_str:
            size_mb = float(size_str.replace(" KB", "")) / 1024

        return IndexStats(
            index_name=self.index_name,
            vector_count=vector_count,
            index_size_mb=size_mb,
        )

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

