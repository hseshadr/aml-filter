"""FastAPI dependencies."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.session import Database

# Module-level singleton wired by `set_database` during app startup.
# Skill bans module-level infrastructure globals in principle; a future refactor
# should move this onto `app.state` so tests can swap implementations cleanly.
_db: Database | None = None


def set_database(database: Database) -> None:
    """Set the global database instance."""
    global _db  # noqa: PLW0603 — singleton wired at app startup
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


__all__ = ["_db", "get_db_session", "set_database"]
