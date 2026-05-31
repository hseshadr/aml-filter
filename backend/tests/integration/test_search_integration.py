"""Integration tests for complete search pipeline with PostgreSQL."""

from datetime import date

import pytest

from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import EntityEmbedding
from aml_filter.domain.normalization import prepare_embedding_text
from aml_filter.domain.search import SearchQuery
from aml_filter.embedding.service import EmbeddingService
from aml_filter.scoring.policy import create_preset_policy
from aml_filter.search.hybrid_search import HybridSearchService
from aml_filter.search.localvec_backend import (
    EntityVector,
    LocalVecBackend,
    entity_vector_to_embedding,
)
from aml_filter.search.service import SearchService


async def _localvec_from(
    entities: list[DBEntity], embeddings: list[list[float]]
) -> LocalVecBackend:
    """Build an in-memory localvec backend from DB entities + their embeddings.

    Mirrors what ingest persists, so the vector leg of the pipeline retrieves from
    edge-proc's FAISS index instead of pgvector — without touching disk. Async because
    it runs inside the test's event loop (cannot nest ``asyncio.run``).
    """
    backend = LocalVecBackend()
    await backend.insert_embeddings(
        [
            entity_vector_to_embedding(
                EntityVector(
                    e.entity_id, vec, e.source_list, e.risk_category, e.entity_type, e.tenant_id
                )
            )
            for e, vec in zip(entities, embeddings, strict=True)
        ]
    )
    return backend


@pytest.mark.integration
class TestSearchIntegration:
    """Integration tests for complete search pipeline."""

    @pytest.mark.asyncio
    async def test_end_to_end_search(self, db_session):
        """Test complete search pipeline from entity creation to results."""
        # Create test entities (global ones don't need tenant)
        entity1 = DBEntity(
            entity_id="test:entity:1",
            entity_type="PERSON",
            primary_name="John Doe",
            name_canonical="john doe",
            name_tokens=["john", "doe"],
            name_trigram="john doe",
            aliases=[{"name": "J. Doe", "name_canonical": "j. doe", "source": "OFAC"}],
            dob=[date(1980, 1, 15)],
            countries=["US"],
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2024-01",
        )

        entity2 = DBEntity(
            entity_id="test:entity:2",
            entity_type="PERSON",
            primary_name="Jane Smith",
            name_canonical="jane smith",
            name_tokens=["jane", "smith"],
            name_trigram="jane smith",
            aliases=[],
            dob=[date(1985, 3, 20)],
            countries=["CA"],
            risk_category="PEP",
            source_list="EU",
            list_version="2024-01",
        )

        db_session.add(entity1)
        db_session.add(entity2)
        await db_session.commit()

        # Create embeddings
        embedding_service = EmbeddingService()
        embedding_text1 = prepare_embedding_text("John Doe", "US")
        embedding_text2 = prepare_embedding_text("Jane Smith", "CA")

        embedding1 = await embedding_service.embed(embedding_text1)
        embedding2 = await embedding_service.embed(embedding_text2)

        db_embedding1 = EntityEmbedding(
            entity_id="test:entity:1",
            embedding=embedding1,
            embedding_model="sentence-transformers",
            model_version="default",
        )
        db_embedding2 = EntityEmbedding(
            entity_id="test:entity:2",
            embedding=embedding2,
            embedding_model="sentence-transformers",
            model_version="default",
        )

        db_session.add(db_embedding1)
        db_session.add(db_embedding2)
        await db_session.commit()

        # Vector retrieval is served by edge-proc localvec: build its FAISS index from
        # the same embeddings and inject it so the vector leg exercises the new backend.
        localvec = await _localvec_from([entity1, entity2], [embedding1, embedding2])
        hybrid = HybridSearchService(session=db_session, vector_backend=localvec)
        search_service = SearchService(
            session=db_session,
            embedding_service=embedding_service,
            hybrid_search_service=hybrid,
        )

        # Create scoring policy
        scoring_policy = create_preset_policy("balanced", "test-policy", "test-tenant")

        # Perform search
        query = SearchQuery(
            name="John Doe",
            dob=date(1980, 1, 15),
            country="US",
            entity_type="PERSON",
            threshold=0.5,
            k=10,
        )

        response = await search_service.search(
            query=query, tenant_id=None, scoring_policy=scoring_policy
        )

        # Verify results
        assert response.request_id is not None
        assert len(response.matches) > 0

        # Should find entity1
        match = next((m for m in response.matches if m.entity_id == "test:entity:1"), None)
        assert match is not None
        assert match.score >= 0.5
        assert match.risk_category == "SANCTION"
        assert match.source_list == "OFAC_SDN"
        assert len(match.reasons) > 0
        assert match.explanation is not None

    @pytest.mark.asyncio
    async def test_vector_search_with_real_pgvector(self, db_session):
        """Test vector search with real pgvector."""
        from aml_filter.search.pgvector_backend import PgVectorBackend

        # Create entity
        entity = DBEntity(
            entity_id="test:vector:1",
            entity_type="PERSON",
            primary_name="Test Person",
            name_canonical="test person",
            name_tokens=["test", "person"],
            name_trigram="test person",
            aliases=[],
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2024-01",
        )
        db_session.add(entity)
        await db_session.commit()

        # Create embedding
        test_embedding = [0.1] * 384  # Dummy embedding
        db_embedding = EntityEmbedding(
            entity_id="test:vector:1",
            embedding=test_embedding,
            embedding_model="sentence-transformers",
            model_version="default",
        )
        db_session.add(db_embedding)
        await db_session.commit()

        # Test vector search
        backend = PgVectorBackend(session=db_session)
        query_vector = [0.1] * 384

        results = await backend.vector_search(
            query_vector=query_vector,
            k=10,
        )

        assert len(results) > 0
        assert any(entity_id == "test:vector:1" for entity_id, _ in results)

    @pytest.mark.asyncio
    async def test_lexical_search_with_real_pg_trgm(self, db_session):
        """Test lexical search with real pg_trgm."""
        from aml_filter.search.lexical_backend import LexicalBackend

        # Create entity
        entity = DBEntity(
            entity_id="test:lexical:1",
            entity_type="PERSON",
            primary_name="John Smith",
            name_canonical="john smith",
            name_tokens=["john", "smith"],
            name_trigram="john smith",
            aliases=[],
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2024-01",
        )
        db_session.add(entity)
        await db_session.commit()

        # Test lexical search
        backend = LexicalBackend(session=db_session)

        results = await backend.lexical_search(
            query_text="john smith",
            k=10,
            similarity_threshold=0.3,
        )

        assert len(results) > 0
        assert any(entity_id == "test:lexical:1" for entity_id, _ in results)

    @pytest.mark.asyncio
    async def test_localvec_vector_retrieval(self, db_session):
        """The localvec backend retrieves an ingested entity by its embedding (parity
        with the old pgvector vector_search, now served from edge-proc FAISS)."""
        entity = DBEntity(
            entity_id="test:localvec:1",
            entity_type="PERSON",
            primary_name="Test Person",
            name_canonical="test person",
            name_tokens=["test", "person"],
            name_trigram="test person",
            aliases=[],
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2024-01",
        )
        db_session.add(entity)
        await db_session.commit()

        embedding = await EmbeddingService().embed(prepare_embedding_text("Test Person"))
        backend = await _localvec_from([entity], [embedding])

        results = await backend.vector_search(query_vector=embedding, k=10)

        assert any(entity_id == "test:localvec:1" for entity_id, _ in results)

    @pytest.mark.asyncio
    async def test_hybrid_search_integration(self, db_session):
        """Test hybrid search combining vector and lexical."""
        from aml_filter.embedding.service import EmbeddingService
        from aml_filter.search.hybrid_search import HybridSearchService

        embedding_service = EmbeddingService()

        # Create entity
        entity = DBEntity(
            entity_id="test:hybrid:1",
            entity_type="PERSON",
            primary_name="Robert Johnson",
            name_canonical="robert johnson",
            name_tokens=["robert", "johnson"],
            name_trigram="robert johnson",
            aliases=[],
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2024-01",
        )
        db_session.add(entity)
        await db_session.commit()

        # Create embedding
        embedding_text = prepare_embedding_text("Robert Johnson")
        embedding = await embedding_service.embed(embedding_text)

        db_embedding = EntityEmbedding(
            entity_id="test:hybrid:1",
            embedding=embedding,
            embedding_model="sentence-transformers",
            model_version="default",
        )
        db_session.add(db_embedding)
        await db_session.commit()

        # Test hybrid search with the localvec vector backend (built from the embedding)
        localvec = await _localvec_from([entity], [embedding])
        hybrid_service = HybridSearchService(session=db_session, vector_backend=localvec)

        results = await hybrid_service.search(
            query_vector=embedding,
            query_text="robert johnson",
            k=10,
        )

        assert len(results) > 0
        entity_ids = [entity_id for entity_id, _, _ in results]
        assert "test:hybrid:1" in entity_ids
