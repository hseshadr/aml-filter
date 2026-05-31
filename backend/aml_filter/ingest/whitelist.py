"""Whitelist customer ingestion service."""

import uuid
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import EntityEmbedding
from aml_filter.domain.normalization import NormalizedName, normalize_name, prepare_embedding_text
from aml_filter.embedding.service import EmbeddingService
from aml_filter.queue import enqueue_screening
from aml_filter.types import JsonArray, JsonObject

# A user-supplied alias entry: {"name": ..., "source": ...}.
AliasInput = dict[str, str]


def _normalize_aliases(aliases: list[AliasInput] | None) -> JsonArray:
    """Normalize alias entries for JSONB storage; missing fields default to '' / 'user'."""
    if not aliases:
        return []
    return [
        {
            "name": alias.get("name", ""),
            "name_canonical": normalize_name(alias.get("name", "")).name_canonical,
            "source": alias.get("source", "user"),
        }
        for alias in aliases
    ]


def _build_whitelist_entity(
    *,
    entity_id: str,
    tenant_id: str,
    name: str,
    entity_type: str,
    normalized: NormalizedName,
    dob: list[date] | None,
    country: str | None,
    aliases_json: JsonArray,
    identifiers_json: JsonObject,
    metadata: JsonObject,
) -> DBEntity:
    """Construct a WHITELIST DBEntity row from the canonicalized customer payload."""
    return DBEntity(
        entity_id=entity_id,
        tenant_id=tenant_id,
        entity_type=entity_type,
        primary_name=name,
        name_canonical=normalized.name_canonical,
        name_tokens=normalized.name_tokens,
        name_trigram=normalized.name_trigram,
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
        raw_source=metadata,
    )


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
        aliases: list[AliasInput] | None = None,
        identifiers: JsonObject | None = None,
        metadata: JsonObject | None = None,
    ) -> DBEntity:
        """Add (or update) a whitelist customer; triggers bidirectional screening on insert."""
        normalized = normalize_name(name)
        existing = await self._find_existing_customer(tenant_id, normalized.name_canonical)
        if existing:
            return await self._update_customer(
                existing,
                name=name,
                name_canonical=normalized.name_canonical,
                name_tokens=normalized.name_tokens,
                name_trigram=normalized.name_trigram,
                dob=dob,
                country=country,
                aliases=aliases,
                identifiers=identifiers,
                metadata=metadata,
            )

        entity_id = f"whitelist:{tenant_id}:{uuid.uuid4().hex[:16]}"
        entity = _build_whitelist_entity(
            entity_id=entity_id,
            tenant_id=tenant_id,
            name=name,
            entity_type=entity_type,
            normalized=normalized,
            dob=dob,
            country=country,
            aliases_json=_normalize_aliases(aliases),
            identifiers_json=identifiers or {},
            metadata=metadata or {},
        )
        embedding_vector = await self.embedding_service.embed(prepare_embedding_text(name, country))
        await self._persist_entity_with_embedding(entity, embedding_vector)

        enqueue_screening(
            "aml_filter.worker.screening_jobs.screen_blacklist_on_whitelist_update",
            tenant_id=tenant_id,
            whitelist_entity_id=entity_id,
        )
        return entity

    async def _persist_entity_with_embedding(
        self, entity: DBEntity, embedding_vector: list[float]
    ) -> None:
        """Add the entity + its embedding to the session, commit, and refresh."""
        self.session.add(entity)
        await self.session.flush()
        await self.session.merge(
            EntityEmbedding(
                entity_id=entity.entity_id,
                embedding=embedding_vector,
                embedding_model=str(self.embedding_service.get_model_info()["model_name"]),
                model_version="default",
            )
        )
        await self.session.commit()
        await self.session.refresh(entity)

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
        aliases: list[AliasInput] | None,
        identifiers: JsonObject | None,
        metadata: JsonObject | None,
    ) -> DBEntity:
        """Update existing customer."""
        entity.primary_name = name
        entity.name_canonical = name_canonical
        entity.name_tokens = name_tokens
        entity.name_trigram = name_trigram
        self._apply_optional_fields(entity, dob, country, aliases, identifiers, metadata)

        # Regenerate embedding if name changed.
        if entity.primary_name != name:
            await self._regenerate_embedding(entity, name, country)

        await self.session.commit()
        await self.session.refresh(entity)
        return entity

    @classmethod
    def _apply_optional_fields(
        cls,
        entity: DBEntity,
        dob: list[date] | None,
        country: str | None,
        aliases: list[AliasInput] | None,
        identifiers: JsonObject | None,
        metadata: JsonObject | None,
    ) -> None:
        """Apply each provided (non-None) optional field onto the entity in place."""
        cls._apply_profile_fields(entity, dob, country, aliases)
        if identifiers is not None:
            entity.identifiers = identifiers
        if metadata is not None:
            entity.raw_source = metadata

    @staticmethod
    def _apply_profile_fields(
        entity: DBEntity,
        dob: list[date] | None,
        country: str | None,
        aliases: list[AliasInput] | None,
    ) -> None:
        """Apply the provided name/profile fields (dob, country, aliases) onto the entity."""
        if dob is not None:
            entity.dob = dob
        if country is not None:
            entity.countries = [country] if country else []
        if aliases is not None:
            entity.aliases = _normalize_aliases(aliases)

    async def _regenerate_embedding(self, entity: DBEntity, name: str, country: str | None) -> None:
        """Recompute and merge the entity's embedding after a name change."""
        embedding_vector = await self.embedding_service.embed(prepare_embedding_text(name, country))
        await self.session.merge(
            EntityEmbedding(
                entity_id=entity.entity_id,
                embedding=embedding_vector,
                embedding_model=str(self.embedding_service.get_model_info()["model_name"]),
                model_version="default",
            )
        )

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
