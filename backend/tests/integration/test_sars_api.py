"""Integration tests for the SAR API (/v1/sars) against a live database."""

from __future__ import annotations

import io
import uuid

import pytest
from pypdf import PdfReader
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import Customer, Entity, Tenant, WhitelistBlacklistMatch
from aml_filter.scoring.tiers import MatchTier

_FILER = {
    "name": "Compliance Officer",
    "institution": "Acme Bank",
    "contact": "aml@acme.test",
}
_NARRATIVE = "Customer wired funds to a sanctioned party shortly after onboarding."


async def _seed_match(
    session: AsyncSession,
    tenant_id: str,
    *,
    tier: str = MatchTier.STRONG.value,
    score: float = 0.92,
    customer_reference: str = "CUST-001",
) -> tuple[str, str]:
    """Seed a customer + sanctioned entity + match; return (customer_id, match_id)."""
    wl_id, bl_id = f"wl-{uuid.uuid4()}", f"bl-{uuid.uuid4()}"
    session.add_all(
        [
            Entity(
                entity_id=wl_id,
                tenant_id=tenant_id,
                entity_type="PERSON",
                primary_name="Jon Q Customer",
                name_canonical="jon q customer",
                name_trigram="jon q customer",
                risk_category="WHITELIST",
                source_list="CUSTOMER",
                list_version="v1",
            ),
            Entity(
                entity_id=bl_id,
                tenant_id=None,
                entity_type="PERSON",
                primary_name="John Quincy Sanctioned",
                name_canonical="john quincy sanctioned",
                name_trigram="john quincy sanctioned",
                risk_category="SANCTION",
                source_list="OFAC_SDN",
                list_version="2026-06",
            ),
        ]
    )
    await session.flush()
    customer_id, match_id = str(uuid.uuid4()), str(uuid.uuid4())
    session.add(
        Customer(
            customer_id=customer_id,
            tenant_id=tenant_id,
            customer_reference=customer_reference,
            onboarding_status="ACTIVE",
            onboarded_by="tester",
            screening_entity_id=wl_id,
        )
    )
    session.add(
        WhitelistBlacklistMatch(
            match_id=match_id,
            tenant_id=tenant_id,
            whitelist_entity_id=wl_id,
            blacklist_entity_id=bl_id,
            match_score=score,
            match_type="WHITELIST_VS_BLACKLIST",
            match_tier=tier,
            resolution_status="PENDING",
        )
    )
    await session.commit()
    return customer_id, match_id


def _create_body(customer_id: str, match_id: str, narrative: str | None = _NARRATIVE) -> dict:
    """Request body for POST /v1/sars."""
    return {
        "customer_id": customer_id,
        "match_id": match_id,
        "jurisdiction": "US",
        "template": "FINCEN",
        "narrative": narrative,
        "filer": _FILER,
    }


@pytest.mark.integration
class TestCreateSar:
    """POST /v1/sars enforces the STRONG gate."""

    @pytest.mark.asyncio
    async def test_requires_auth(self, client):
        resp = await client.post("/v1/sars", json={})
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_creates_for_strong_match(self, client, auth_headers, db_session, test_tenant):
        customer_id, match_id = await _seed_match(db_session, test_tenant.tenant_id)
        resp = await client.post(
            "/v1/sars", json=_create_body(customer_id, match_id), headers=auth_headers
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["status"] == "COMPLETED"
        assert body["subject"]["matched_sanctioned_name"] == "John Quincy Sanctioned"
        assert body["subject"]["match_tier"] == "STRONG"
        assert body["filer"]["institution"] == "Acme Bank"

    @pytest.mark.asyncio
    async def test_draft_when_no_narrative(self, client, auth_headers, db_session, test_tenant):
        customer_id, match_id = await _seed_match(db_session, test_tenant.tenant_id)
        resp = await client.post(
            "/v1/sars",
            json=_create_body(customer_id, match_id, narrative=None),
            headers=auth_headers,
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["status"] == "DRAFT"

    @pytest.mark.asyncio
    async def test_rejects_possible_match(self, client, auth_headers, db_session, test_tenant):
        customer_id, match_id = await _seed_match(
            db_session, test_tenant.tenant_id, tier=MatchTier.POSSIBLE.value, score=0.70
        )
        resp = await client.post(
            "/v1/sars", json=_create_body(customer_id, match_id), headers=auth_headers
        )
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_rejects_weak_match(self, client, auth_headers, db_session, test_tenant):
        customer_id, match_id = await _seed_match(
            db_session, test_tenant.tenant_id, tier=MatchTier.WEAK.value, score=0.40
        )
        resp = await client.post(
            "/v1/sars", json=_create_body(customer_id, match_id), headers=auth_headers
        )
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_rejects_unknown_match(self, client, auth_headers, db_session, test_tenant):
        customer_id, _ = await _seed_match(db_session, test_tenant.tenant_id)
        resp = await client.post(
            "/v1/sars", json=_create_body(customer_id, "nope"), headers=auth_headers
        )
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_rejects_foreign_tenant_match(
        self, client, auth_headers, db_session, test_tenant
    ):
        other = Tenant(tenant_id="other-tenant", name="Other", plan="starter")
        db_session.add(other)
        await db_session.commit()
        customer_id, match_id = await _seed_match(db_session, "other-tenant")
        resp = await client.post(
            "/v1/sars", json=_create_body(customer_id, match_id), headers=auth_headers
        )
        assert resp.status_code == 422, resp.text


@pytest.mark.integration
class TestSnapshotImmutable:
    """The persisted SAR snapshot does not change when the customer later changes."""

    @pytest.mark.asyncio
    async def test_snapshot_unchanged_after_customer_edit(
        self, client, auth_headers, db_session, test_tenant
    ):
        customer_id, match_id = await _seed_match(db_session, test_tenant.tenant_id)
        created = await client.post(
            "/v1/sars", json=_create_body(customer_id, match_id), headers=auth_headers
        )
        sar_id = created.json()["sar_id"]

        customer = await db_session.get(Customer, customer_id)
        customer.customer_reference = "CHANGED"
        await db_session.commit()

        resp = await client.get(f"/v1/sars/{sar_id}", headers=auth_headers)
        assert resp.json()["subject"]["customer_reference"] == "CUST-001"


@pytest.mark.integration
class TestListAndGet:
    """GET /v1/sars (list, paginate, filter) + GET /v1/sars/{id}."""

    @pytest.mark.asyncio
    async def test_list_tenant_scoped(self, client, auth_headers, db_session, test_tenant):
        customer_id, match_id = await _seed_match(db_session, test_tenant.tenant_id)
        await client.post(
            "/v1/sars", json=_create_body(customer_id, match_id), headers=auth_headers
        )
        resp = await client.get("/v1/sars", headers=auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    @pytest.mark.asyncio
    async def test_list_empty_for_other_tenant(self, client, db_session, test_tenant):
        customer_id, match_id = await _seed_match(db_session, test_tenant.tenant_id)
        # Build with the real tenant's key
        from aml_filter.db.models import ApiKey
        from aml_filter.security.api_key import hash_api_key

        db_session.add(Tenant(tenant_id="empty-tenant", name="Empty", plan="starter"))
        await db_session.flush()
        db_session.add(
            ApiKey(
                key_id="empty-key",
                tenant_id="empty-tenant",
                key_hash=hash_api_key("aml_empty_key"),
                name="empty",
            )
        )
        await db_session.commit()
        resp = await client.get("/v1/sars", headers={"X-API-Key": "aml_empty_key"})
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_get_404_for_unknown(self, client, auth_headers, test_tenant):
        resp = await client.get("/v1/sars/nope", headers=auth_headers)
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_filter_by_status(self, client, auth_headers, db_session, test_tenant):
        c1, m1 = await _seed_match(db_session, test_tenant.tenant_id, customer_reference="A")
        c2, m2 = await _seed_match(db_session, test_tenant.tenant_id, customer_reference="B")
        await client.post("/v1/sars", json=_create_body(c1, m1), headers=auth_headers)
        await client.post(
            "/v1/sars", json=_create_body(c2, m2, narrative=None), headers=auth_headers
        )
        resp = await client.get("/v1/sars?status=DRAFT", headers=auth_headers)
        assert resp.status_code == 200
        rows = resp.json()
        assert len(rows) == 1
        assert rows[0]["status"] == "DRAFT"


@pytest.mark.integration
class TestUpdateSar:
    """PUT /v1/sars/{id} edits narrative/filer/status."""

    @pytest.mark.asyncio
    async def test_completing_requires_narrative(
        self, client, auth_headers, db_session, test_tenant
    ):
        customer_id, match_id = await _seed_match(db_session, test_tenant.tenant_id)
        created = await client.post(
            "/v1/sars",
            json=_create_body(customer_id, match_id, narrative=None),
            headers=auth_headers,
        )
        sar_id = created.json()["sar_id"]
        resp = await client.put(
            f"/v1/sars/{sar_id}", json={"status": "COMPLETED"}, headers=auth_headers
        )
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_update_narrative_then_complete(
        self, client, auth_headers, db_session, test_tenant
    ):
        customer_id, match_id = await _seed_match(db_session, test_tenant.tenant_id)
        created = await client.post(
            "/v1/sars",
            json=_create_body(customer_id, match_id, narrative=None),
            headers=auth_headers,
        )
        sar_id = created.json()["sar_id"]
        resp = await client.put(
            f"/v1/sars/{sar_id}",
            json={"narrative": "Now we have a story.", "status": "COMPLETED"},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "COMPLETED"
        assert body["suspicious_activity_narrative"] == "Now we have a story."


@pytest.mark.integration
class TestExportSar:
    """GET /v1/sars/{id}/export streams JSON or PDF and marks EXPORTED."""

    @pytest.mark.asyncio
    async def test_export_json_roundtrips(self, client, auth_headers, db_session, test_tenant):
        customer_id, match_id = await _seed_match(db_session, test_tenant.tenant_id)
        created = await client.post(
            "/v1/sars", json=_create_body(customer_id, match_id), headers=auth_headers
        )
        sar_id = created.json()["sar_id"]
        resp = await client.get(f"/v1/sars/{sar_id}/export?format=json", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("application/json")
        payload = resp.json()
        assert payload["sar_id"] == sar_id
        assert payload["subject"]["matched_source_list"] == "OFAC_SDN"

    @pytest.mark.asyncio
    async def test_export_pdf_returns_pdf_bytes(
        self, client, auth_headers, db_session, test_tenant
    ):
        customer_id, match_id = await _seed_match(db_session, test_tenant.tenant_id)
        created = await client.post(
            "/v1/sars", json=_create_body(customer_id, match_id), headers=auth_headers
        )
        sar_id = created.json()["sar_id"]
        resp = await client.get(f"/v1/sars/{sar_id}/export?format=pdf", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content.startswith(b"%PDF")
        text = "\n".join(p.extract_text() for p in PdfReader(io.BytesIO(resp.content)).pages)
        assert "FinCEN Suspicious Activity Report" in text
        assert "John Quincy Sanctioned" in text

    @pytest.mark.asyncio
    async def test_export_marks_status_exported(
        self, client, auth_headers, db_session, test_tenant
    ):
        customer_id, match_id = await _seed_match(db_session, test_tenant.tenant_id)
        created = await client.post(
            "/v1/sars", json=_create_body(customer_id, match_id), headers=auth_headers
        )
        sar_id = created.json()["sar_id"]
        await client.get(f"/v1/sars/{sar_id}/export?format=json", headers=auth_headers)
        resp = await client.get(f"/v1/sars/{sar_id}", headers=auth_headers)
        assert resp.json()["status"] == "EXPORTED"
