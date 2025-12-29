"""Ingestion service for loading sanctions lists."""

import os
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import EntityEmbedding, ListVersion
from aml_filter.domain.entity import Entity
from aml_filter.domain.normalization import prepare_embedding_text
from aml_filter.embedding.service import EmbeddingService
from aml_filter.ingest.parsers.ofac import OFACParser


class IngestionService:
    """Service for ingesting sanctions lists into the database."""

    def __init__(
        self,
        session: AsyncSession,
        embedding_service: EmbeddingService | None = None,
    ) -> None:
        """
        Initialize ingestion service.

        Args:
            session: Async SQLAlchemy session
            embedding_service: Optional embedding service (creates default if None)
        """
        self.session = session
        self.embedding_service = embedding_service or EmbeddingService()
        self.ofac_parser = OFACParser()

    async def ingest_ofac_sdn(
        self,
        xml_content: str | bytes,
        list_id: str = "OFAC_SDN",
        version: str | None = None,
        batch_size: int = 100,
    ) -> dict[str, Any]:
        """
        Ingest OFAC SDN XML file.

        Args:
            xml_content: OFAC SDN XML content
            list_id: List identifier
            version: Optional version string (defaults to current date)
            batch_size: Number of entities to process per batch

        Returns:
            Dictionary with ingestion statistics
        """
        if version is None:
            version = datetime.now().strftime("%Y-%m-%d")

        # Parse XML
        entities = self.ofac_parser.parse(xml_content)

        return await self.ingest_entities(
            entities=entities,
            source_list=list_id,
            version=version,
            batch_size=batch_size,
        )

    async def ingest_entities(
        self,
        entities: list[Entity],
        source_list: str,
        version: str,
        batch_size: int = 100,
    ) -> dict[str, Any]:
        """
        Ingest a list of entities into the database.

        Args:
            entities: List of domain entities
            source_list: List identifier
            version: Version string
            batch_size: Number of entities to process per batch

        Returns:
            Dictionary with ingestion statistics
        """
        # Create list version record
        list_version = ListVersion(
            list_id=source_list,
            version=version,
            entity_count=len(entities),
            ingested_at=datetime.now(),
            status="PENDING",
        )
        self.session.add(list_version)

        # Process entities in batches
        total_inserted = 0
        total_updated = 0
        total_embeddings = 0

        for i in range(0, len(entities), batch_size):
            batch = entities[i : i + batch_size]

            # Check which entities already exist
            entity_ids = [e.entity_id for e in batch]
            stmt = select(DBEntity).where(DBEntity.entity_id.in_(entity_ids))
            result = await self.session.execute(stmt)
            existing_entities = {e.entity_id: e for e in result.scalars().all()}

            # Prepare embeddings
            embedding_texts = [
                prepare_embedding_text(e.primary_name, e.countries[0] if e.countries else None)
                for e in batch
            ]
            embeddings = await self.embedding_service.embed_batch(embedding_texts, batch_size=batch_size)

            # Process each entity
            for entity, embedding in zip(batch, embeddings, strict=False):
                # Convert domain entity to DB entity
                db_entity = self._domain_to_db_entity(entity, existing_entities.get(entity.entity_id))

                if entity.entity_id in existing_entities:
                    # Update existing
                    total_updated += 1
                else:
                    # Insert new
                    self.session.add(db_entity)
                    total_inserted += 1

                # Create or update embedding
                db_embedding = EntityEmbedding(
                    entity_id=entity.entity_id,
                    embedding=embedding,
                    embedding_model=self.embedding_service.get_model_info()["model_name"],
                    model_version="default",
                )
                # Use merge to handle updates
                await self.session.merge(db_embedding)
                total_embeddings += 1

            # Commit batch
            await self.session.commit()

        # Activate list version
        list_version.status = "ACTIVE"
        list_version.activated_at = datetime.now()
        await self.session.commit()

        # Trigger bidirectional screening for all tenants with whitelists
        # This is done asynchronously via background job
        try:
            from redis import Redis
            from rq import Queue

            redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
            redis_conn = Redis.from_url(redis_url)
            queue = Queue("screening", connection=redis_conn)

            # Get all tenants that have whitelist customers
            from aml_filter.db.models import Entity as DBEntityModel
            from aml_filter.db.models import Tenant

            tenants_with_whitelist = await self.session.execute(
                select(Tenant.tenant_id).distinct().join(
                    DBEntityModel, DBEntityModel.tenant_id == Tenant.tenant_id
                ).where(DBEntityModel.risk_category == "WHITELIST")
            )
            tenant_ids = [row[0] for row in tenants_with_whitelist.all()]

            for tenant_id in tenant_ids:
                queue.enqueue(
                    "aml_filter.worker.screening_jobs.screen_whitelist_on_blacklist_update",
                    tenant_id=tenant_id,
                    list_id=source_list,
                    list_version=version,
                )
        except Exception:
            # If Redis/RQ is not available, continue without enqueueing
            pass

        return {
            "list_id": source_list,
            "version": version,
            "total": len(entities),
            "created": total_inserted,
            "updated": total_updated,
            "embeddings": total_embeddings,
        }

    def _domain_to_db_entity(
        self, domain_entity: Entity, existing: DBEntity | None = None
    ) -> DBEntity:
        """Convert domain entity to database entity."""
        # Convert aliases to JSONB format
        aliases_json = [
            {
                "name": alias.name,
                "name_canonical": alias.name_canonical,
                "source": alias.source,
            }
            for alias in domain_entity.aliases
        ]

        # Convert identifiers to JSONB format
        identifiers_json = {
            "passport": domain_entity.identifiers.passport,
            "national_id": domain_entity.identifiers.national_id,
            "other": domain_entity.identifiers.other,
        }

        if existing:
            # Update existing entity
            existing.primary_name = domain_entity.primary_name
            existing.name_canonical = domain_entity.name_canonical
            existing.name_tokens = domain_entity.name_tokens
            existing.name_trigram = domain_entity.name_trigram
            existing.aliases = aliases_json
            existing.dob = domain_entity.dob
            existing.countries = domain_entity.countries
            existing.nationalities = domain_entity.nationalities
            existing.identifiers = identifiers_json
            existing.risk_category = domain_entity.risk_category
            existing.source_list = domain_entity.source_list
            existing.list_version = domain_entity.list_version
            existing.raw_source = domain_entity.raw_source
            return existing
        else:
            # Create new entity
            return DBEntity(
                entity_id=domain_entity.entity_id,
                tenant_id=domain_entity.tenant_id,
                entity_type=domain_entity.entity_type,
                primary_name=domain_entity.primary_name,
                name_canonical=domain_entity.name_canonical,
                name_tokens=domain_entity.name_tokens,
                name_trigram=domain_entity.name_trigram,
                aliases=aliases_json,
                dob=domain_entity.dob,
                countries=domain_entity.countries,
                nationalities=domain_entity.nationalities,
                addresses=domain_entity.addresses,
                identifiers=identifiers_json,
                risk_category=domain_entity.risk_category,
                source_list=domain_entity.source_list,
                list_version=domain_entity.list_version,
                custom_list_id=domain_entity.custom_list_id,
                raw_source=domain_entity.raw_source,
            )

