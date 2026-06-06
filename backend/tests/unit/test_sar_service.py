"""Unit tests for the SAR service — lifecycle, gates, and persistence."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import Customer, Entity, Sar, Tenant, WhitelistBlacklistMatch
from aml_filter.domain.sar import Filer, SarJurisdiction, SarStatus, SarTemplate
from aml_filter.sar.errors import SarGatingError
from aml_filter.sar.service import SarService
from aml_filter.scoring.tiers import MatchTier

_FILER = Filer(name="Officer", institution="Acme Bank", contact="aml@acme.test")


async def _seed(
    session: AsyncSession, *, tenant_id: str = "acme", reference: str = "REF-1"
) -> tuple[str, str]:
    """Seed tenant, customer entity, sanctioned entity, customer, STRONG match."""
    session.add(Tenant(tenant_id=tenant_id, name="Acme", plan="starter"))
    await session.flush()
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
                dob=[date(1980, 1, 2)],
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
            customer_reference=reference,
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
            match_score=0.92,
            match_type="WHITELIST_VS_BLACKLIST",
            match_tier=MatchTier.STRONG.value,
            resolution_status="PENDING",
        )
    )
    await session.commit()
    return customer_id, match_id


async def _create(
    service: SarService, customer_id: str, match_id: str, narrative: str | None = "A narrative."
) -> Sar:
    """Create a SAR through the service with the standard filer."""
    return await service.create(
        tenant_id="acme",
        customer_id=customer_id,
        match_id=match_id,
        jurisdiction=SarJurisdiction.US,
        template=SarTemplate.FINCEN,
        narrative=narrative,
        filer=_FILER,
        created_by="officer",
    )


@pytest.mark.asyncio
async def test_should_persist_completed_sar_when_narrative_given(session: AsyncSession) -> None:
    # Given
    customer_id, match_id = await _seed(session)
    service = SarService(session=session)

    # When
    sar = await _create(service, customer_id, match_id)

    # Then
    assert sar.status == SarStatus.COMPLETED.value
    assert sar.subject["matched_sanctioned_name"] == "John Quincy Sanctioned"
    assert sar.filer["institution"] == "Acme Bank"


@pytest.mark.asyncio
async def test_should_persist_draft_when_no_narrative(session: AsyncSession) -> None:
    # Given
    customer_id, match_id = await _seed(session)
    service = SarService(session=session)

    # When
    sar = await _create(service, customer_id, match_id, narrative=None)

    # Then
    assert sar.status == SarStatus.DRAFT.value


@pytest.mark.asyncio
async def test_should_raise_when_creating_for_non_strong(session: AsyncSession) -> None:
    # Given
    customer_id, _ = await _seed(session)
    service = SarService(session=session)

    # When / Then
    with pytest.raises(SarGatingError):
        await _create(service, customer_id, "missing-match")


@pytest.mark.asyncio
async def test_should_get_tenant_scoped_sar(session: AsyncSession) -> None:
    # Given
    customer_id, match_id = await _seed(session)
    service = SarService(session=session)
    sar = await _create(service, customer_id, match_id)

    # When
    fetched = await service.get("acme", sar.sar_id)
    foreign = await service.get("other", sar.sar_id)

    # Then
    assert fetched is not None
    assert foreign is None


@pytest.mark.asyncio
async def test_should_list_with_status_filter(session: AsyncSession) -> None:
    # Given
    c1, m1 = await _seed(session)
    service = SarService(session=session)
    await _create(service, c1, m1, narrative=None)  # DRAFT

    # When
    drafts = await service.list(
        tenant_id="acme", status=SarStatus.DRAFT, customer_id=None, limit=10, offset=0
    )
    completed = await service.list(
        tenant_id="acme", status=SarStatus.COMPLETED, customer_id=None, limit=10, offset=0
    )

    # Then
    assert len(drafts) == 1
    assert completed == []


@pytest.mark.asyncio
async def test_should_list_filtered_by_customer(session: AsyncSession) -> None:
    # Given
    c1, m1 = await _seed(session)
    service = SarService(session=session)
    await _create(service, c1, m1)

    # When
    mine = await service.list(tenant_id="acme", status=None, customer_id=c1, limit=10, offset=0)
    other = await service.list(
        tenant_id="acme", status=None, customer_id="nobody", limit=10, offset=0
    )

    # Then
    assert len(mine) == 1
    assert other == []


@pytest.mark.asyncio
async def test_should_update_narrative_and_complete(session: AsyncSession) -> None:
    # Given
    customer_id, match_id = await _seed(session)
    service = SarService(session=session)
    sar = await _create(service, customer_id, match_id, narrative=None)

    # When
    updated = await service.update(
        sar, narrative="Now a story.", filer=None, status=SarStatus.COMPLETED
    )

    # Then
    assert updated.status == SarStatus.COMPLETED.value
    assert updated.suspicious_activity_narrative == "Now a story."


@pytest.mark.asyncio
async def test_should_reject_completion_without_narrative(session: AsyncSession) -> None:
    # Given
    customer_id, match_id = await _seed(session)
    service = SarService(session=session)
    sar = await _create(service, customer_id, match_id, narrative=None)

    # When / Then
    with pytest.raises(SarGatingError):
        await service.update(sar, narrative=None, filer=None, status=SarStatus.COMPLETED)


@pytest.mark.asyncio
async def test_should_update_filer(session: AsyncSession) -> None:
    # Given
    customer_id, match_id = await _seed(session)
    service = SarService(session=session)
    sar = await _create(service, customer_id, match_id)
    new_filer = Filer(name="New", institution="Other Bank", contact="x@y.test")

    # When
    updated = await service.update(sar, narrative=None, filer=new_filer, status=None)

    # Then
    assert updated.filer["institution"] == "Other Bank"


@pytest.mark.asyncio
async def test_should_reject_edit_when_exported(session: AsyncSession) -> None:
    # Given
    customer_id, match_id = await _seed(session)
    service = SarService(session=session)
    sar = await _create(service, customer_id, match_id)
    await service.mark_exported(sar)

    # When / Then
    with pytest.raises(SarGatingError):
        await service.update(sar, narrative="x", filer=None, status=None)


@pytest.mark.asyncio
async def test_should_mark_exported(session: AsyncSession) -> None:
    # Given
    customer_id, match_id = await _seed(session)
    service = SarService(session=session)
    sar = await _create(service, customer_id, match_id)

    # When
    await service.mark_exported(sar)

    # Then
    assert sar.status == SarStatus.EXPORTED.value
