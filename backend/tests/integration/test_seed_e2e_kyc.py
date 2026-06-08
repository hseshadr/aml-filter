"""Integration test: the e2e-kyc seed is clean-idempotent.

The Playwright ``e2e-kyc`` suite re-seeds on every boot. Re-running the seed
against a non-fresh DB previously *accumulated* duplicate customers/matches on
the seeded entity (the journey onboards app-created customers that the seed's
``session.get`` guards do not clean up), which produced a false 500 on the
review-resolve endpoint locally. The seed must reset its tenant-scoped tables
before seeding so repeated runs start clean.
"""

from collections.abc import Sequence

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from aml_filter.db.models import Customer, WhitelistBlacklistMatch
from scripts import seed_e2e_kyc


class _StubEmbedder:
    """A fast, deterministic stand-in for ``EmbeddingService`` (no model load)."""

    async def embed(self, _text: str) -> Sequence[float]:
        return [0.0] * 384

    def get_model_info(self) -> dict[str, str]:
        return {"model_name": "stub-embedder"}


async def _count(session: AsyncSession, model: type, tenant_id: str) -> int:
    result = await session.execute(
        select(func.count()).select_from(model).where(model.tenant_id == tenant_id)
    )
    return int(result.scalar_one())


@pytest.mark.integration
@pytest.mark.asyncio
async def test_seed_twice_is_idempotent(engine, database_url) -> None:
    embedder = _StubEmbedder()
    await seed_e2e_kyc.seed(database_url, embedder=embedder)

    # Simulate the journey: an app-created customer + match accrue on the tenant
    # between webServer boots (the case that previously polluted the DB).
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        s.add(
            Customer(
                customer_id="app-created-dup",
                tenant_id=seed_e2e_kyc.E2E_TENANT_ID,
                customer_reference="CUST-APP-RUNTIME",
                onboarding_status="ACTIVE",
                onboarded_by="app",
                screening_entity_id=seed_e2e_kyc.E2E_WEAK_WL_ENTITY_ID,
            )
        )
        await s.commit()

    # Re-seed (as the webServer would on the next boot).
    await seed_e2e_kyc.seed(database_url, embedder=embedder)

    async with maker() as s:
        customers = await _count(s, Customer, seed_e2e_kyc.E2E_TENANT_ID)
        matches = await _count(s, WhitelistBlacklistMatch, seed_e2e_kyc.E2E_TENANT_ID)

    assert customers == 1, "re-seed must reset to the single seeded customer"
    assert matches == 1, "re-seed must reset to the single seeded match"
