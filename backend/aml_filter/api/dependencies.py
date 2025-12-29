"""FastAPI dependencies."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.session import Database

# Global database instance (will be set during app startup)
_db: Database | None = None


def set_database(database: Database) -> None:
    """Set the global database instance."""
    global _db
    _db = database


async def get_db_session() -> AsyncGenerator[AsyncSession]:
    """
    Get database session dependency.

    This will be properly configured with the database instance.
    """
    if _db is None:
        raise RuntimeError("Database not initialized. Call set_database() first.")

    async with _db.async_session_maker() as session:
        yield session


__all__ = ["get_db_session", "set_database", "_db"]

