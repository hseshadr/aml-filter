"""Lexical search backend using pg_trgm."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import Entity
from aml_filter.domain.search import SearchFilters


class LexicalBackend:
    """Lexical search backend using PostgreSQL pg_trgm extension."""

    def __init__(self, session: AsyncSession) -> None:
        """
        Initialize lexical search backend.

        Args:
            session: Async SQLAlchemy session
        """
        self.session = session

    async def lexical_search(
        self,
        query_text: str,
        k: int,
        tenant_id: str | None = None,
        filters: SearchFilters | None = None,
        similarity_threshold: float = 0.3,
    ) -> list[tuple[str, float]]:
        """
        Perform lexical similarity search using pg_trgm.

        Args:
            query_text: Normalized query text (should be canonicalized)
            k: Number of results to return
            tenant_id: Optional tenant ID for filtering
            filters: Optional search filters
            similarity_threshold: Minimum similarity threshold (0-1)

        Returns:
            List of (entity_id, similarity_score) tuples, sorted by similarity (descending)
        """
        # Build query with pg_trgm similarity
        # similarity() returns a value between 0 and 1
        stmt = (
            select(
                Entity.entity_id,
                func.similarity(Entity.name_trigram, query_text).label("similarity"),
            )
            .where(func.similarity(Entity.name_trigram, query_text) >= similarity_threshold)
            .order_by(func.similarity(Entity.name_trigram, query_text).desc())
            .limit(k)
        )

        # Apply tenant filtering
        if tenant_id is None:
            # Include only global entities (tenant_id IS NULL)
            stmt = stmt.where(Entity.tenant_id.is_(None))
        else:
            # Include both tenant-specific and global entities
            stmt = stmt.where((Entity.tenant_id == tenant_id) | (Entity.tenant_id.is_(None)))

        # Apply additional filters if provided
        if filters:
            if filters.source_lists:
                stmt = stmt.where(Entity.source_list.in_(filters.source_lists))

            if filters.risk_categories:
                stmt = stmt.where(Entity.risk_category.in_(filters.risk_categories))

            if filters.entity_types:
                stmt = stmt.where(Entity.entity_type.in_(filters.entity_types))

        # Execute query
        result = await self.session.execute(stmt)
        rows = result.all()

        # Return as (entity_id, similarity) tuples
        # Note: similarity is already 0-1, we return it as-is (higher is better)
        return [(row.entity_id, float(row.similarity)) for row in rows]

    async def combined_lexical_search(
        self,
        query_text: str,
        k: int,
        tenant_id: str | None = None,
        filters: SearchFilters | None = None,
        similarity_threshold: float = 0.3,
    ) -> list[tuple[str, float]]:
        """
        Combined lexical search on primary names.

        Note: Alias matching is handled in the scoring phase for better performance.
        This method searches only the primary name_trigram field.

        Args:
            query_text: Normalized query text
            k: Number of results to return
            tenant_id: Optional tenant ID for filtering
            filters: Optional search filters
            similarity_threshold: Minimum similarity threshold

        Returns:
            List of (entity_id, similarity_score) tuples
        """
        # For now, just use the primary name search
        # Alias matching will be handled in scoring phase
        return await self.lexical_search(
            query_text=query_text,
            k=k,
            tenant_id=tenant_id,
            filters=filters,
            similarity_threshold=similarity_threshold,
        )
