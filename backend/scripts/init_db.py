#!/usr/bin/env python3
"""Initialize database with migrations."""

import asyncio
import os
import sys

try:
    from dotenv import find_dotenv, load_dotenv

    load_dotenv(find_dotenv(), override=False)
except Exception:
    pass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from aml_filter.db.session import create_database


async def init_database(database_url: str) -> None:
    """Initialize database with required extensions."""
    engine = create_async_engine(database_url, echo=False)

    async with engine.begin() as conn:
        # Create extensions
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS btree_gin"))
        print("✓ Database extensions created")

    await engine.dispose()
    print("✓ Database initialized successfully")


def main() -> None:
    """Main entry point."""
    database_url = os.getenv(
        "DATABASE_URL", "postgresql+asyncpg://amlfilter:amlfilter_dev_password@localhost:5432/amlfilter"
    )

    print(f"Initializing database: {database_url}")
    asyncio.run(init_database(database_url))
    print("\nNext steps:")
    print("1. Run migrations: uv run alembic upgrade head")
    print("2. Start the API: uv run uvicorn aml_filter.api.main:app --reload")


if __name__ == "__main__":
    main()

