"""Integration tests for audit endpoints."""

from datetime import date

import pytest

from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import EntityEmbedding
from aml_filter.domain.normalization import prepare_embedding_text
from aml_filter.embedding.service import EmbeddingService


@pytest.mark.integration
class TestAuditEndpoints:
    @pytest.mark.asyncio
    async def test_screen_persists_audit_and_can_fetch(self, client, session, auth_headers):
        # Arrange: create an entity + embedding so search returns at least one match
        entity = DBEntity(
            entity_id="test:audit:1",
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
            tenant_id=None,
        )
        session.add(entity)
        await session.commit()

        embedding_service = EmbeddingService()
        emb_text = prepare_embedding_text("John Doe", "US")
        embedding = await embedding_service.embed(emb_text)
        session.add(
            EntityEmbedding(
                entity_id="test:audit:1",
                embedding=embedding,
                embedding_model="sentence-transformers",
                model_version="default",
            )
        )
        await session.commit()

        # Act: screen with auth header (audit persistence is tenant-scoped)
        resp = await client.post(
            "/v1/screen",
            headers=auth_headers,
            json={
                "name": "John Doe",
                "dob": "1980-01-15",
                "country": "US",
                "entity_type": "PERSON",
                "threshold": 0.1,
                "k": 5,
            },
        )
        assert resp.status_code == 200
        request_id = resp.json()["request_id"]

        # Assert: fetch audit record by request_id
        audit_resp = await client.get(f"/v1/audit/{request_id}", headers=auth_headers)
        assert audit_resp.status_code == 200
        audit = audit_resp.json()
        assert audit["request_id"] == request_id
        assert audit["tenant_id"] == "test-tenant"
        assert "request_hash" in audit and len(audit["request_hash"]) == 64
        assert audit["query"]["name"] == "John Doe"
        assert "matches" in audit

    @pytest.mark.asyncio
    async def test_list_audit_records(self, client, auth_headers):
        resp = await client.get("/v1/audit?limit=50&offset=0", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert isinstance(data["items"], list)
