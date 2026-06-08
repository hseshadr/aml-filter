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
    with_customer: bool = True,
) -> tuple[str, str | None]:
    """Create a customer entity, a sanctions entity, and a match linking them.

    Returns ``(match_id, customer_id)``. When ``with_customer`` is False, the
    whitelist entity has no onboarded ``Customer`` row, mimicking a bare
    whitelist entity; in that case ``customer_id`` is None.
    """
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
    customer_id: str | None = None
    if with_customer:
        customer_id = str(uuid.uuid4())
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
    return match.match_id, customer_id


async def _add_duplicate_customer(
    session: AsyncSession,
    tenant_id: str,
    *,
    match_id: str,
    customer_reference: str,
) -> str:
    """Attach a *second* Customer row to a match's whitelist entity.

    ``customers.screening_entity_id`` has only an index (no UNIQUE constraint),
    so more than one customer can legitimately point at the same screening
    entity. The review query outer-joins Customer on that column, so a second
    customer fans the joined row out — the cardinality bug. Returns the new
    customer_id.
    """
    match = await session.get(WhitelistBlacklistMatch, match_id)
    assert match is not None
    customer_id = str(uuid.uuid4())
    session.add(
        Customer(
            customer_id=customer_id,
            tenant_id=tenant_id,
            customer_reference=customer_reference,
            onboarding_status="ACTIVE",
            onboarded_by="tester",
            screening_entity_id=match.whitelist_entity_id,
        )
    )
    await session.commit()
    return customer_id


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
        _, customer_id = await _seed_match(
            db_session, test_tenant.tenant_id, score=0.92, tier=MatchTier.STRONG.value
        )
        resp = await client.get("/v1/review/matches", headers=auth_headers)
        assert resp.status_code == 200
        rows = resp.json()
        assert len(rows) == 1
        row = rows[0]
        assert row["tier"] == "STRONG"
        assert row["customer_reference"] == "CUST-001"
        assert row["customer_id"] == customer_id
        assert row["customer_name"] == "Jon Q Customer"
        assert row["sanctioned_name"] == "John Quincy Sanctioned"
        assert row["source_list"] == "OFAC_SDN"
        assert row["match_score"] == pytest.approx(0.92, abs=1e-3)
        assert row["resolution_status"] == "PENDING"

    @pytest.mark.asyncio
    async def test_bare_whitelist_entity_has_null_customer_id(
        self, client, auth_headers, db_session, test_tenant
    ):
        # A match against a whitelist entity not created via onboarding has no
        # linked Customer row, so customer_id (and customer_reference) is null.
        await _seed_match(
            db_session,
            test_tenant.tenant_id,
            score=0.88,
            tier=MatchTier.STRONG.value,
            with_customer=False,
        )
        resp = await client.get("/v1/review/matches", headers=auth_headers)
        assert resp.status_code == 200
        rows = resp.json()
        assert len(rows) == 1
        assert rows[0]["customer_id"] is None
        assert rows[0]["customer_reference"] is None
        # The whitelist entity's own name still resolves.
        assert rows[0]["customer_name"] == "Jon Q Customer"

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
        match_id, customer_id = await _seed_match(
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
        assert body["customer_id"] == customer_id

    @pytest.mark.asyncio
    async def test_resolve_missing_match_404(self, client, auth_headers):
        resp = await client.put(
            "/v1/review/matches/nonexistent/resolve",
            params={"resolution_status": "RESOLVED"},
            json={"reviewer_id": "a", "review_notes": "n"},
            headers=auth_headers,
        )
        assert resp.status_code == 404


@pytest.mark.integration
class TestReviewDuplicateCustomerCardinality:
    """Regression: a whitelist entity shared by >1 Customer must not fan the row out.

    ``customers.screening_entity_id`` has no UNIQUE constraint, so two customers
    can point at the same screening entity. The review query outer-joins Customer
    on that column; without a dedupe, the join multiplies the match row, which
    (a) made ``resolve`` 500 with ``MultipleResultsFound`` and (b) double-counted
    the match in the list endpoint.
    """

    @pytest.mark.asyncio
    async def test_resolve_with_duplicate_customer_returns_200(
        self, client, auth_headers, db_session, test_tenant
    ):
        match_id, _ = await _seed_match(
            db_session,
            test_tenant.tenant_id,
            score=0.92,
            tier=MatchTier.STRONG.value,
            customer_reference="CUST-PRIMARY",
        )
        await _add_duplicate_customer(
            db_session,
            test_tenant.tenant_id,
            match_id=match_id,
            customer_reference="CUST-DUPLICATE",
        )
        resp = await client.put(
            f"/v1/review/matches/{match_id}/resolve",
            params={"resolution_status": "TRUE_POSITIVE"},
            json={"reviewer_id": "analyst-7", "review_notes": "Confirmed."},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["resolution_status"] == "TRUE_POSITIVE"

    @pytest.mark.asyncio
    async def test_list_with_duplicate_customer_returns_match_once(
        self, client, auth_headers, db_session, test_tenant
    ):
        match_id, _ = await _seed_match(
            db_session,
            test_tenant.tenant_id,
            score=0.92,
            tier=MatchTier.STRONG.value,
            customer_reference="CUST-PRIMARY",
        )
        await _add_duplicate_customer(
            db_session,
            test_tenant.tenant_id,
            match_id=match_id,
            customer_reference="CUST-DUPLICATE",
        )
        resp = await client.get("/v1/review/matches", headers=auth_headers)
        assert resp.status_code == 200
        rows = resp.json()
        assert len(rows) == 1
        assert rows[0]["match_id"] == match_id
