"""Ingestion service for loading sanctions lists."""

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import EntityEmbedding, ListVersion, Tenant
from aml_filter.domain.entity import Entity
from aml_filter.domain.normalization import prepare_embedding_text
from aml_filter.embedding.service import EmbeddingService
from aml_filter.ingest.parsers.ofac import OFACParser
from aml_filter.queue import enqueue_screening


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
        """Ingest entities into the DB in batches, activate the list version, enqueue screening."""
        list_version = ListVersion(
            list_id=source_list,
            version=version,
            entity_count=len(entities),
            ingested_at=datetime.now(),
            status="PENDING",
        )
        self.session.add(list_version)

        stats = {"created": 0, "updated": 0, "embeddings": 0}
        for i in range(0, len(entities), batch_size):
            batch_stats = await self._ingest_batch(entities[i : i + batch_size], batch_size)
            for k, v in batch_stats.items():
                stats[k] += v
            await self.session.commit()

        list_version.status = "ACTIVE"
        list_version.activated_at = datetime.now()
        await self.session.commit()

        await self._enqueue_screening_for_tenants_with_whitelist(source_list, version)
        return {"list_id": source_list, "version": version, "total": len(entities), **stats}

    async def _ingest_batch(self, batch: list[Entity], batch_size: int) -> dict[str, int]:
        """Process one batch: load existing rows, embed, upsert entities + embeddings."""
        entity_ids = [e.entity_id for e in batch]
        result = await self.session.execute(
            select(DBEntity).where(DBEntity.entity_id.in_(entity_ids))
        )
        existing = {e.entity_id: e for e in result.scalars().all()}

        embeddings = await self.embedding_service.embed_batch(
            [
                prepare_embedding_text(e.primary_name, e.countries[0] if e.countries else None)
                for e in batch
            ],
            batch_size=batch_size,
        )
        model_name = self.embedding_service.get_model_info()["model_name"]
        stats = {"created": 0, "updated": 0, "embeddings": 0}
        for entity, embedding in zip(batch, embeddings, strict=False):
            db_entity = self._domain_to_db_entity(entity, existing.get(entity.entity_id))
            if entity.entity_id in existing:
                stats["updated"] += 1
            else:
                self.session.add(db_entity)
                stats["created"] += 1
            await self.session.merge(
                EntityEmbedding(
                    entity_id=entity.entity_id,
                    embedding=embedding,
                    embedding_model=model_name,
                    model_version="default",
                )
            )
            stats["embeddings"] += 1
        return stats

    async def _enqueue_screening_for_tenants_with_whitelist(
        self, source_list: str, version: str
    ) -> None:
        """Enqueue background bidirectional screening for every tenant with a whitelist."""
        tenants = await self.session.execute(
            select(Tenant.tenant_id)
            .distinct()
            .join(DBEntity, DBEntity.tenant_id == Tenant.tenant_id)
            .where(DBEntity.risk_category == "WHITELIST")
        )
        for (tenant_id,) in tenants.all():
            enqueue_screening(
                "aml_filter.worker.screening_jobs.screen_whitelist_on_blacklist_update",
                tenant_id=tenant_id,
                list_id=source_list,
                list_version=version,
            )

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
