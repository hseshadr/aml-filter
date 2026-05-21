"""Whitelist customer ingestion service."""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import EntityEmbedding
from aml_filter.domain.normalization import normalize_name, prepare_embedding_text
from aml_filter.embedding.service import EmbeddingService
from aml_filter.queue import enqueue_screening


class WhitelistIngestionService:
    """Service for ingesting whitelist customers."""

    def __init__(
        self,
        session: AsyncSession,
        embedding_service: EmbeddingService | None = None,
    ):
        """
        Initialize whitelist ingestion service.

        Args:
            session: Database session
            embedding_service: Optional embedding service (creates default if None)
        """
        self.session = session
        self.embedding_service = embedding_service or EmbeddingService()

    async def add_customer(
        self,
        tenant_id: str,
        name: str,
        entity_type: str = "PERSON",
        dob: list[date] | None = None,
        country: str | None = None,
        aliases: list[dict[str, Any]] | None = None,
        identifiers: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> DBEntity:
        """
        Add a customer to the whitelist.

        Args:
            tenant_id: Tenant ID
            name: Customer name
            entity_type: 'PERSON' or 'ORGANIZATION'
            dob: Optional list of dates of birth
            country: Optional country code (ISO 3166-1 alpha-2)
            aliases: Optional list of aliases
            identifiers: Optional identifiers dictionary
            metadata: Optional metadata dictionary

        Returns:
            Created entity record
        """
        # Normalize name
        normalized = normalize_name(name)
        name_canonical = normalized["name_canonical"]
        name_tokens = normalized["name_tokens"]
        name_trigram = normalized["name_trigram"]

        # Generate entity ID
        entity_id = f"whitelist:{tenant_id}:{uuid.uuid4().hex[:16]}"

        # Check if entity already exists (by name and tenant)
        existing = await self._find_existing_customer(tenant_id, name_canonical)
        if existing:
            # Update existing
            return await self._update_customer(
                existing,
                name=name,
                name_canonical=name_canonical,
                name_tokens=name_tokens,
                name_trigram=name_trigram,
                dob=dob,
                country=country,
                aliases=aliases,
                identifiers=identifiers,
                metadata=metadata,
            )

        # Prepare embedding text
        embedding_text = prepare_embedding_text(name, country)

        # Generate embedding
        embedding_vector = await self.embedding_service.embed(embedding_text)

        # Prepare aliases JSONB
        aliases_json = []
        if aliases:
            for alias in aliases:
                alias_normalized = normalize_name(alias.get("name", ""))
                aliases_json.append(
                    {
                        "name": alias.get("name", ""),
                        "name_canonical": alias_normalized["name_canonical"],
                        "source": alias.get("source", "user"),
                    }
                )

        # Prepare identifiers JSONB
        identifiers_json = identifiers or {}

        # Create entity
        entity = DBEntity(
            entity_id=entity_id,
            tenant_id=tenant_id,
            entity_type=entity_type,
            primary_name=name,
            name_canonical=name_canonical,
            name_tokens=name_tokens,
            name_trigram=name_trigram,
            aliases=aliases_json,
            dob=dob or [],
            countries=[country] if country else [],
            nationalities=[],
            addresses=[],
            identifiers=identifiers_json,
            risk_category="WHITELIST",
            source_list="CUSTOMER_WHITELIST",
            list_version=datetime.now().strftime("%Y-%m-%d"),
            custom_list_id=None,
            raw_source=metadata or {},
        )

        self.session.add(entity)
        await self.session.flush()

        # Create embedding
        embedding = EntityEmbedding(
            entity_id=entity_id,
            embedding=embedding_vector,
            embedding_model=self.embedding_service.get_model_info()["model_name"],
            model_version="default",
        )
        await self.session.merge(embedding)

        await self.session.commit()
        await self.session.refresh(entity)

        # Trigger bidirectional screening for this new customer (fail-soft)
        enqueue_screening(
            "aml_filter.worker.screening_jobs.screen_blacklist_on_whitelist_update",
            tenant_id=tenant_id,
            whitelist_entity_id=entity_id,
        )

        return entity

    async def _find_existing_customer(self, tenant_id: str, name_canonical: str) -> DBEntity | None:
        """Find existing customer by name."""
        result = await self.session.execute(
            select(DBEntity).where(
                DBEntity.tenant_id == tenant_id,
                DBEntity.risk_category == "WHITELIST",
                DBEntity.name_canonical == name_canonical,
            )
        )
        return result.scalar_one_or_none()

    async def _update_customer(
        self,
        entity: DBEntity,
        name: str,
        name_canonical: str,
        name_tokens: list[str],
        name_trigram: str,
        dob: list[date] | None,
        country: str | None,
        aliases: list[dict[str, Any]] | None,
        identifiers: dict[str, Any] | None,
        metadata: dict[str, Any] | None,
    ) -> DBEntity:
        """Update existing customer."""
        entity.primary_name = name
        entity.name_canonical = name_canonical
        entity.name_tokens = name_tokens
        entity.name_trigram = name_trigram

        if dob is not None:
            entity.dob = dob
        if country is not None:
            entity.countries = [country] if country else []
        if aliases is not None:
            aliases_json = []
            for alias in aliases:
                alias_normalized = normalize_name(alias.get("name", ""))
                aliases_json.append(
                    {
                        "name": alias.get("name", ""),
                        "name_canonical": alias_normalized["name_canonical"],
                        "source": alias.get("source", "user"),
                    }
                )
            entity.aliases = aliases_json
        if identifiers is not None:
            entity.identifiers = identifiers
        if metadata is not None:
            entity.raw_source = metadata

        # Regenerate embedding if name changed
        if entity.primary_name != name:
            embedding_text = prepare_embedding_text(name, country)
            embedding_vector = await self.embedding_service.embed(embedding_text)

            embedding = EntityEmbedding(
                entity_id=entity.entity_id,
                embedding=embedding_vector,
                embedding_model=self.embedding_service.get_model_info()["model_name"],
                model_version="default",
            )
            await self.session.merge(embedding)

        await self.session.commit()
        await self.session.refresh(entity)

        return entity

    async def delete_customer(self, tenant_id: str, entity_id: str) -> bool:
        """
        Delete a customer from whitelist.

        Args:
            tenant_id: Tenant ID
            entity_id: Entity ID

        Returns:
            True if deleted, False if not found
        """
        result = await self.session.execute(
            select(DBEntity).where(
                DBEntity.entity_id == entity_id,
                DBEntity.tenant_id == tenant_id,
                DBEntity.risk_category == "WHITELIST",
            )
        )
        entity = result.scalar_one_or_none()
        if entity:
            await self.session.delete(entity)
            await self.session.commit()
            return True
        return False

    async def list_customers(
        self,
        tenant_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> list[DBEntity]:
        """
        List whitelist customers for a tenant.

        Args:
            tenant_id: Tenant ID
            limit: Maximum number of results
            offset: Offset for pagination

        Returns:
            List of entity records
        """
        query = (
            select(DBEntity)
            .where(
                DBEntity.tenant_id == tenant_id,
                DBEntity.risk_category == "WHITELIST",
            )
            .order_by(DBEntity.created_at.desc())
            .limit(limit)
            .offset(offset)
        )

        result = await self.session.execute(query)
        return list(result.scalars().all())
