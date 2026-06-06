"""Integration tests for the review board API (GET /v1/review/matches + resolve)."""

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import Customer, Entity, WhitelistBlacklistMatch
from aml_filter.scoring.tiers import MatchTier


async def _seed_match(
    session: AsyncSession,
    tenant_id: str,
    *,
    score: float,
    tier: str,
    status: str | None = "PENDING",
    customer_reference: str = "CUST-001",
) -> str:
    """Create a customer entity, a sanctions entity, and a match linking them."""
    wl_id = f"wl-{uuid.uuid4()}"
    bl_id = f"bl-{uuid.uuid4()}"
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
    session.add(
        Customer(
            customer_id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            customer_reference=customer_reference,
            onboarding_status="ACTIVE",
            onboarded_by="tester",
            screening_entity_id=wl_id,
        )
    )
    match = WhitelistBlacklistMatch(
        match_id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        whitelist_entity_id=wl_id,
        blacklist_entity_id=bl_id,
        match_score=score,
        match_type="WHITELIST_VS_BLACKLIST",
        match_tier=tier,
        resolution_status=status,
    )
    session.add(match)
    await session.commit()
    return match.match_id


@pytest.mark.integration
class TestReviewMatchesAPI:
    """GET /v1/review/matches."""

    @pytest.mark.asyncio
    async def test_requires_auth(self, client):
        resp = await client.get("/v1/review/matches")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_empty_returns_200_empty_list(self, client, auth_headers):
        resp = await client.get("/v1/review/matches", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_returns_joined_customer_and_entity_fields(
        self, client, auth_headers, db_session, test_tenant
    ):
        await _seed_match(
            db_session, test_tenant.tenant_id, score=0.92, tier=MatchTier.STRONG.value
        )
        resp = await client.get("/v1/review/matches", headers=auth_headers)
        assert resp.status_code == 200
        rows = resp.json()
        assert len(rows) == 1
        row = rows[0]
        assert row["tier"] == "STRONG"
        assert row["customer_reference"] == "CUST-001"
        assert row["customer_name"] == "Jon Q Customer"
        assert row["sanctioned_name"] == "John Quincy Sanctioned"
        assert row["source_list"] == "OFAC_SDN"
        assert row["match_score"] == pytest.approx(0.92, abs=1e-3)
        assert row["resolution_status"] == "PENDING"

    @pytest.mark.asyncio
    async def test_filter_by_tier(self, client, auth_headers, db_session, test_tenant):
        await _seed_match(
            db_session,
            test_tenant.tenant_id,
            score=0.92,
            tier=MatchTier.STRONG.value,
            customer_reference="CUST-A",
        )
        await _seed_match(
            db_session,
            test_tenant.tenant_id,
            score=0.50,
            tier=MatchTier.WEAK.value,
            customer_reference="CUST-B",
        )
        resp = await client.get("/v1/review/matches?tier=STRONG", headers=auth_headers)
        assert resp.status_code == 200
        rows = resp.json()
        assert len(rows) == 1
        assert rows[0]["tier"] == "STRONG"

    @pytest.mark.asyncio
    async def test_filter_by_status(self, client, auth_headers, db_session, test_tenant):
        await _seed_match(
            db_session,
            test_tenant.tenant_id,
            score=0.92,
            tier=MatchTier.STRONG.value,
            status="PENDING",
            customer_reference="CUST-A",
        )
        await _seed_match(
            db_session,
            test_tenant.tenant_id,
            score=0.91,
            tier=MatchTier.STRONG.value,
            status="TRUE_POSITIVE",
            customer_reference="CUST-B",
        )
        resp = await client.get(
            "/v1/review/matches?resolution_status=PENDING", headers=auth_headers
        )
        assert resp.status_code == 200
        rows = resp.json()
        assert len(rows) == 1
        assert rows[0]["resolution_status"] == "PENDING"

    @pytest.mark.asyncio
    async def test_tenant_scoped(self, client, auth_headers, db_session, test_tenant):
        from aml_filter.db.models import Tenant

        other = Tenant(tenant_id="other-tenant", name="Other", plan="starter")
        db_session.add(other)
        await db_session.commit()
        await _seed_match(db_session, "other-tenant", score=0.95, tier=MatchTier.STRONG.value)
        resp = await client.get("/v1/review/matches", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_pagination_limit(self, client, auth_headers, db_session, test_tenant):
        for i in range(3):
            await _seed_match(
                db_session,
                test_tenant.tenant_id,
                score=0.92,
                tier=MatchTier.STRONG.value,
                customer_reference=f"CUST-{i}",
            )
        resp = await client.get("/v1/review/matches?limit=2", headers=auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 2


@pytest.mark.integration
class TestReviewResolveAPI:
    """PUT /v1/review/matches/{id}/resolve persists reviewer + notes."""

    @pytest.mark.asyncio
    async def test_resolve_persists_reviewer_and_notes(
        self, client, auth_headers, db_session, test_tenant
    ):
        match_id = await _seed_match(
            db_session, test_tenant.tenant_id, score=0.92, tier=MatchTier.STRONG.value
        )
        resp = await client.put(
            f"/v1/review/matches/{match_id}/resolve",
            params={"resolution_status": "TRUE_POSITIVE"},
            json={"reviewer_id": "analyst-7", "review_notes": "Confirmed."},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["resolution_status"] == "TRUE_POSITIVE"
        assert body["reviewer_id"] == "analyst-7"
        assert body["review_notes"] == "Confirmed."

    @pytest.mark.asyncio
    async def test_resolve_missing_match_404(self, client, auth_headers):
        resp = await client.put(
            "/v1/review/matches/nonexistent/resolve",
            params={"resolution_status": "RESOLVED"},
            json={"reviewer_id": "a", "review_notes": "n"},
            headers=auth_headers,
        )
        assert resp.status_code == 404
