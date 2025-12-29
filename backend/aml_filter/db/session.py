"""Database session management."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from aml_filter.db.models import Base


class Database:
    """Database connection manager."""

    def __init__(self, database_url: str) -> None:
        """Initialize database connection."""
        self.engine = create_async_engine(
            database_url,
            echo=False,
            future=True,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
        )
        self.async_session_maker = async_sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )

    async def create_tables(self) -> None:
        """Create all database tables."""
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def drop_tables(self) -> None:
        """Drop all database tables."""
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    async def close(self) -> None:
        """Close database connection."""
        await self.engine.dispose()


async def get_db_session() -> AsyncGenerator[AsyncSession]:
    """Get database session dependency."""
    # This will be properly configured with FastAPI dependency injection
    # For now, it's a placeholder
    raise NotImplementedError("Database session must be configured with database instance")


def create_database(database_url: str) -> Database:
    """Create and return database instance."""
    return Database(database_url)

