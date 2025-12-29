"""Integration tests for API endpoints with real database."""

import pytest
from datetime import date
from aml_filter.db.models import Entity as DBEntity, EntityEmbedding

@pytest.mark.integration
class TestAPIIntegration:
    """Integration tests for API endpoints."""

    @pytest.mark.asyncio
    async def test_health_endpoint(self, client):
        """Test health check endpoint."""
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy"}

    @pytest.mark.asyncio
    async def test_root_endpoint(self, client):
        """Test root endpoint."""
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "AML-Filter v2"
        assert data["version"] == "2.0.0"

    @pytest.mark.asyncio
    async def test_screen_endpoint_with_data(
        self, client, db_session
    ):
        """Test screening endpoint with real data."""
        from aml_filter.domain.normalization import prepare_embedding_text
        from aml_filter.embedding.service import EmbeddingService

        embedding_service = EmbeddingService()

        # Create test entity
        entity = DBEntity(
            entity_id="test:api:1",
            entity_type="PERSON",
            primary_name="John Doe",
            name_canonical="john doe",
            name_tokens=["john", "doe"],
            name_trigram="john doe",
            aliases=[],
            dob=[date(1980, 1, 15)],
            countries=["US"],
            risk_category="SANCTION",
            source_list="OFAC_SDN",
            list_version="2024-01",
        )
        db_session.add(entity)
        await db_session.commit()

        # Create embedding
        embedding_text = prepare_embedding_text("John Doe", "US")
        embedding = await embedding_service.embed(embedding_text)

        db_embedding = EntityEmbedding(
            entity_id="test:api:1",
            embedding=embedding,
            embedding_model="sentence-transformers",
            model_version="default",
        )
        db_session.add(db_embedding)
        await db_session.commit()

        # Test screening endpoint
        response = await client.post(
            "/v1/screen",
            json={
                "name": "John Doe",
                "dob": "1980-01-15",
                "country": "US",
                "entity_type": "PERSON",
                "threshold": 0.5,
                "k": 10,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "request_id" in data
        assert "matches" in data
        assert len(data["matches"]) > 0

        # Verify match structure
        match = data["matches"][0]
        assert "entity_id" in match
        assert "score" in match
        assert "risk_category" in match
        assert "reasons" in match
        assert "explanation" in match

    @pytest.mark.asyncio
    async def test_screen_endpoint_validation(self, client):
        """Test screening endpoint input validation."""
        # Test missing required field
        response = await client.post(
            "/v1/screen",
            json={
                "threshold": 0.5,
            },
        )
        assert response.status_code == 422  # Validation error

        # Test invalid threshold
        response = await client.post(
            "/v1/screen",
            json={
                "name": "Test",
                "threshold": 1.5,  # > 1.0
            },
        )
        assert response.status_code == 422

        # Test invalid k
        response = await client.post(
            "/v1/screen",
            json={
                "name": "Test",
                "k": 200,  # > 100
            },
        )
        assert response.status_code == 422
