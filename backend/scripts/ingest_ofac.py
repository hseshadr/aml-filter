#!/usr/bin/env python3
"""Ingest OFAC SDN XML file."""

import asyncio
import os
import sys
from pathlib import Path

try:
    from dotenv import find_dotenv, load_dotenv

    load_dotenv(find_dotenv(), override=False)
except Exception:
    pass

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from aml_filter.db.session import Database
from aml_filter.ingest.service import IngestionService


async def ingest_file(
    file_path: str, database_url: str, list_id: str = "OFAC_SDN", version: str | None = None
) -> None:
    """Ingest OFAC SDN XML file."""
    # Read file
    path = Path(file_path)
    if not path.exists():
        print(f"Error: File not found: {file_path}")
        sys.exit(1)

    print(f"Reading OFAC SDN file: {file_path}")
    content = path.read_bytes()

    # Create database connection
    database = Database(database_url)
    async_session_maker = async_sessionmaker(
        database.engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session_maker() as session:
        # Create ingestion service
        ingestion_service = IngestionService(session=session)

        print(f"Ingesting {list_id} list...")
        result = await ingestion_service.ingest_ofac_sdn(
            xml_content=content, list_id=list_id, version=version
        )

        print("\n✓ Ingestion complete!")
        print(f"  List ID: {result['list_id']}")
        print(f"  Version: {result['version']}")
        print(f"  Total entities: {result['total_entities']}")
        print(f"  Inserted: {result['inserted']}")
        print(f"  Updated: {result['updated']}")
        print(f"  Embeddings created: {result['embeddings_created']}")

    await database.close()


def main() -> None:
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python scripts/ingest_ofac.py <xml_file> [list_id] [version]")
        print("Example: python scripts/ingest_ofac.py sdn.xml OFAC_SDN 2024-01-15")
        sys.exit(1)

    file_path = sys.argv[1]
    list_id = sys.argv[2] if len(sys.argv) > 2 else "OFAC_SDN"
    version = sys.argv[3] if len(sys.argv) > 3 else None

    database_url = os.getenv(
        "DATABASE_URL", "postgresql+asyncpg://amlfilter:amlfilter_dev_password@localhost:5432/amlfilter"
    )

    asyncio.run(ingest_file(file_path, database_url, list_id, version))


if __name__ == "__main__":
    main()

