"""Unit tests for the SAR builder — STRONG gating + immutable snapshot assembly."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import Customer, Entity, Tenant, WhitelistBlacklistMatch
from aml_filter.sar.builder import SarBuilder
from aml_filter.sar.errors import SarGatingError
from aml_filter.scoring.tiers import MatchTier


async def _seed(
    session: AsyncSession,
    *,
    tenant_id: str = "acme",
    tier: str = MatchTier.STRONG.value,
    score: float = 0.92,
    customer_name: str = "Jon Q Customer",
) -> tuple[str, str]:
    """Seed tenant, customer entity, sanctioned entity, customer, and a match."""
    session.add(Tenant(tenant_id=tenant_id, name="Acme", plan="starter"))
    await session.flush()
    wl_id, bl_id = f"wl-{uuid.uuid4()}", f"bl-{uuid.uuid4()}"
    session.add_all(
        [
            Entity(
                entity_id=wl_id,
                tenant_id=tenant_id,
                entity_type="PERSON",
                primary_name=customer_name,
                name_canonical=customer_name.lower(),
                name_trigram=customer_name.lower(),
                dob=[date(1980, 1, 2)],
                identifiers={"id_documents": ["X1"]},
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
    customer_id = str(uuid.uuid4())
    session.add(
        Customer(
            customer_id=customer_id,
            tenant_id=tenant_id,
            customer_reference="REF-1",
            onboarding_status="ACTIVE",
            onboarded_by="tester",
            screening_entity_id=wl_id,
        )
    )
    match_id = str(uuid.uuid4())
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


@pytest.mark.asyncio
async def test_should_build_snapshot_when_match_is_strong(session: AsyncSession) -> None:
    # Given
    customer_id, match_id = await _seed(session)
    builder = SarBuilder(session=session)

    # When
    snapshot = await builder.build_snapshot("acme", customer_id, match_id)

    # Then
    assert snapshot.customer_name == "Jon Q Customer"
    assert snapshot.customer_reference == "REF-1"
    assert snapshot.customer_dob == [date(1980, 1, 2)]
    assert snapshot.customer_identifiers == ["X1"]
    assert snapshot.matched_sanctioned_name == "John Quincy Sanctioned"
    assert snapshot.matched_source_list == "OFAC_SDN"
    assert snapshot.match_score == pytest.approx(0.92)
    assert snapshot.match_tier == "STRONG"


@pytest.mark.asyncio
async def test_should_reject_when_match_is_possible(session: AsyncSession) -> None:
    # Given
    customer_id, match_id = await _seed(session, tier=MatchTier.POSSIBLE.value, score=0.70)
    builder = SarBuilder(session=session)

    # When / Then
    with pytest.raises(SarGatingError):
        await builder.build_snapshot("acme", customer_id, match_id)


@pytest.mark.asyncio
async def test_should_reject_when_match_is_weak(session: AsyncSession) -> None:
    # Given
    customer_id, match_id = await _seed(session, tier=MatchTier.WEAK.value, score=0.40)
    builder = SarBuilder(session=session)

    # When / Then
    with pytest.raises(SarGatingError):
        await builder.build_snapshot("acme", customer_id, match_id)


@pytest.mark.asyncio
async def test_should_reject_when_match_unknown(session: AsyncSession) -> None:
    # Given
    customer_id, _ = await _seed(session)
    builder = SarBuilder(session=session)

    # When / Then
    with pytest.raises(SarGatingError):
        await builder.build_snapshot("acme", customer_id, "does-not-exist")


@pytest.mark.asyncio
async def test_should_reject_when_match_belongs_to_other_tenant(session: AsyncSession) -> None:
    # Given
    customer_id, match_id = await _seed(session)
    session.add(Tenant(tenant_id="intruder", name="Intruder", plan="starter"))
    await session.commit()
    builder = SarBuilder(session=session)

    # When / Then
    with pytest.raises(SarGatingError):
        await builder.build_snapshot("intruder", customer_id, match_id)


@pytest.mark.asyncio
async def test_should_reject_when_match_not_linked_to_customer(session: AsyncSession) -> None:
    # Given
    customer_id, match_id = await _seed(session)
    other_id, _ = await _seed(session, tenant_id="acme2")
    builder = SarBuilder(session=session)

    # When / Then — customer from acme2 does not own acme's match
    with pytest.raises(SarGatingError):
        await builder.build_snapshot("acme", other_id, match_id)


@pytest.mark.asyncio
async def test_snapshot_is_immutable_after_customer_changes(session: AsyncSession) -> None:
    # Given
    customer_id, match_id = await _seed(session)
    builder = SarBuilder(session=session)
    snapshot = await builder.build_snapshot("acme", customer_id, match_id)

    # When — the customer reference later changes
    customer = await session.get(Customer, customer_id)
    assert customer is not None
    customer.customer_reference = "REF-CHANGED"
    await session.commit()

    # Then — the already-built snapshot is unaffected (it is a frozen value)
    assert snapshot.customer_reference == "REF-1"
    with pytest.raises(ValidationError):
        snapshot.customer_reference = "X"  # type: ignore[misc]
