"""Integration tests for ingestion pipeline with PostgreSQL."""

import pytest
from datetime import date

from aml_filter.db.models import Entity as DBEntity, EntityEmbedding, ListVersion
from aml_filter.domain.entity import Alias, Entity, EntityIdentifier
from aml_filter.ingest.service import IngestionService


@pytest.mark.integration
class TestIngestionIntegration:
    """Integration tests for ingestion pipeline."""

    @pytest.mark.asyncio
    async def test_ingest_entity_with_embedding(self, db_session, clean_database):
        """Test ingesting an entity with embedding generation."""
        ingestion_service = IngestionService(session=db_session)

        # Create a test entity
        entity = Entity(
            entity_id="test:ingest:1",
            tenant_id=None,
            entity_type="PERSON",
            primary_name="Test Person",
            name_canonical="test person",
            name_tokens=["test", "person"],
            name_trigram="test person",
            aliases=[
                Alias(name="T. Person", name_canonical="t. person", source="OFAC")
            ],
            dob=[date(1990, 1, 1)],
            countries=["US"],
            nationalities=[],
            addresses=[],
            identifiers=EntityIdentifier(),
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2024-01",
            custom_list_id=None,
            raw_source={"test": "data"},
        )

        # Create list version
        from datetime import datetime

        list_version = ListVersion(
            list_id="OFAC_SDN",
            version="2024-01",
            entity_count=1,
            ingested_at=datetime.now(),
            status="PENDING",
        )
        db_session.add(list_version)
        await db_session.commit()

        # Ingest entity (simulate ingestion service method)
        from aml_filter.domain.normalization import prepare_embedding_text
        from aml_filter.embedding.service import EmbeddingService

        embedding_service = EmbeddingService()
        embedding_text = prepare_embedding_text(entity.primary_name, entity.countries[0] if entity.countries else None)
        embedding = await embedding_service.embed(embedding_text)

        # Convert to DB entity
        aliases_json = [
            {
                "name": alias.name,
                "name_canonical": alias.name_canonical,
                "source": alias.source,
            }
            for alias in entity.aliases
        ]

        db_entity = DBEntity(
            entity_id=entity.entity_id,
            tenant_id=entity.tenant_id,
            entity_type=entity.entity_type,
            primary_name=entity.primary_name,
            name_canonical=entity.name_canonical,
            name_tokens=entity.name_tokens,
            name_trigram=entity.name_trigram,
            aliases=aliases_json,
            dob=entity.dob,
            countries=entity.countries,
            nationalities=entity.nationalities,
            addresses=entity.addresses,
            identifiers=entity.identifiers.model_dump(),
            risk_category=entity.risk_category,
            source_list=entity.source_list,
            list_version=entity.list_version,
            custom_list_id=entity.custom_list_id,
            raw_source=entity.raw_source,
        )

        db_session.add(db_entity)

        db_embedding = EntityEmbedding(
            entity_id=entity.entity_id,
            embedding=embedding,
            embedding_model=embedding_service.get_model_info()["model_name"],
            model_version="default",
        )
        db_session.add(db_embedding)
        await db_session.commit()

        # Verify entity was created
        from sqlalchemy import select

        stmt = select(DBEntity).where(DBEntity.entity_id == "test:ingest:1")
        result = await db_session.execute(stmt)
        saved_entity = result.scalar_one_or_none()

        assert saved_entity is not None
        assert saved_entity.primary_name == "Test Person"
        assert saved_entity.name_canonical == "test person"

        # Verify embedding was created
        stmt = select(EntityEmbedding).where(EntityEmbedding.entity_id == "test:ingest:1")
        result = await db_session.execute(stmt)
        saved_embedding = result.scalar_one_or_none()

        assert saved_embedding is not None
        assert saved_embedding.embedding is not None
        assert len(saved_embedding.embedding) == 384  # all-MiniLM-L6-v2 dimension

    @pytest.mark.asyncio
    async def test_batch_ingestion(self, db_session, clean_database):
        """Test batch ingestion of multiple entities."""
        from aml_filter.domain.normalization import prepare_embedding_text
        from aml_filter.embedding.service import EmbeddingService

        embedding_service = EmbeddingService()

        # Create multiple test entities
        entities = []
        for i in range(5):
            entity = DBEntity(
                entity_id=f"test:batch:{i}",
                entity_type="PERSON",
                primary_name=f"Person {i}",
                name_canonical=f"person {i}",
                name_tokens=["person", str(i)],
                name_trigram=f"person {i}",
                aliases=[],
                risk_category="SANCTION",
                source_list="OFAC_SDN",
                list_version="2024-01",
            )
            entities.append(entity)
            db_session.add(entity)

        await db_session.commit()

        # Create embeddings in batch
        embedding_texts = [
            prepare_embedding_text(e.primary_name) for e in entities
        ]
        embeddings = await embedding_service.embed_batch(embedding_texts, batch_size=2)

        # Add embeddings
        for entity, embedding in zip(entities, embeddings):
            db_embedding = EntityEmbedding(
                entity_id=entity.entity_id,
                embedding=embedding,
                embedding_model="sentence-transformers",
                model_version="default",
            )
            db_session.add(db_embedding)

        await db_session.commit()

        # Verify all entities have embeddings
        from sqlalchemy import select

        stmt = select(EntityEmbedding)
        result = await db_session.execute(stmt)
        saved_embeddings = result.scalars().all()

        assert len(saved_embeddings) == 5
        for emb in saved_embeddings:
            assert emb.embedding is not None
            assert len(emb.embedding) == 384

