"""Unit tests for cascade right-to-erasure of a customer's PII + screening footprint."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.customers.erasure import CustomerErasureService
from aml_filter.db.models import (
    Attestation,
    Customer,
    Entity,
    EntityEmbedding,
    Sar,
    Tenant,
    WhitelistBlacklistMatch,
)

_TENANT = "acme"


async def _seed_customer_with_footprint(session: AsyncSession, tenant_id: str, ref: str) -> str:
    """Seed a tenant + customer with entity, embedding, match, SAR, attestation; return id."""
    session.add(Tenant(tenant_id=tenant_id, name=tenant_id, plan="starter"))
    await session.flush()
    wl_id = f"whitelist:{tenant_id}:{uuid.uuid4().hex[:8]}"
    bl_id = f"ofac:{uuid.uuid4().hex[:8]}"
    session.add_all([_entity(wl_id, tenant_id, "WHITELIST"), _entity(bl_id, None, "SANCTION")])
    await session.flush()
    session.add(
        EntityEmbedding(
            entity_id=wl_id, embedding=[0.1] * 384, embedding_model="m", model_version="v1"
        )
    )
    customer_id = str(uuid.uuid4())
    match_id = str(uuid.uuid4())
    session.add(_customer(customer_id, tenant_id, ref, wl_id))
    session.add(_match(match_id, tenant_id, wl_id, bl_id))
    await session.flush()
    session.add(_sar(tenant_id, customer_id, match_id))
    session.add(_attestation(tenant_id, customer_id, ref))
    await session.commit()
    return customer_id


def _entity(entity_id: str, tenant_id: str | None, category: str) -> Entity:
    return Entity(
        entity_id=entity_id,
        tenant_id=tenant_id,
        entity_type="PERSON",
        primary_name="Name",
        name_canonical="name",
        name_trigram="name",
        risk_category=category,
        source_list="SRC",
        list_version="v1",
    )


def _customer(customer_id: str, tenant_id: str, ref: str, wl_id: str) -> Customer:
    return Customer(
        customer_id=customer_id,
        tenant_id=tenant_id,
        customer_reference=ref,
        onboarding_status="ACTIVE",
        onboarded_by="officer",
        screening_entity_id=wl_id,
    )


def _match(match_id: str, tenant_id: str, wl_id: str, bl_id: str) -> WhitelistBlacklistMatch:
    return WhitelistBlacklistMatch(
        match_id=match_id,
        tenant_id=tenant_id,
        whitelist_entity_id=wl_id,
        blacklist_entity_id=bl_id,
        match_score=0.95,
        match_type="WHITELIST_VS_BLACKLIST",
        match_tier="STRONG",
        resolution_status="PENDING",
    )


def _sar(tenant_id: str, customer_id: str, match_id: str) -> Sar:
    return Sar(
        sar_id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        customer_id=customer_id,
        match_id=match_id,
        jurisdiction="US",
        template="FINCEN",
        subject={},
        filer={"name": "Officer", "institution": "Acme", "contact": "x@y.test"},
        status="DRAFT",
        created_by="officer",
    )


def _attestation(tenant_id: str, customer_id: str, ref: str) -> Attestation:
    now = datetime.now(UTC)
    return Attestation(
        attestation_id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        customer_id=customer_id,
        customer_reference=ref,
        screened_at=now,
        valid_until=now,
        lists_and_versions=[],
        status="CLEAR",
        match_count=0,
        pending_count=0,
    )


async def _count(session: AsyncSession, model: type) -> int:
    return await session.scalar(select(func.count()).select_from(model)) or 0


@pytest.mark.asyncio
async def test_erase_removes_all_dependent_rows_for_customer(session: AsyncSession) -> None:
    # Given a customer with a full screening + compliance footprint
    customer_id = await _seed_customer_with_footprint(session, _TENANT, "REF-1")
    customer = await session.get(Customer, customer_id)
    assert customer is not None

    # When the customer is erased
    await CustomerErasureService(session).erase(_TENANT, customer)

    # Then no dependent rows remain for that customer/entity
    assert await _count(session, Customer) == 0
    assert await _count(session, EntityEmbedding) == 0
    assert await _count(session, WhitelistBlacklistMatch) == 0
    assert await _count(session, Sar) == 0
    assert await _count(session, Attestation) == 0
    # The customer's WHITELIST entity is gone (the blacklist entity is shared, stays)
    remaining = await session.scalars(select(Entity.risk_category))
    assert "WHITELIST" not in set(remaining.all())


@pytest.mark.asyncio
async def test_erase_does_not_touch_another_tenants_data(session: AsyncSession) -> None:
    # Given two tenants each with a full footprint
    target_id = await _seed_customer_with_footprint(session, "acme", "REF-A")
    await _seed_customer_with_footprint(session, "globex", "REF-B")
    target = await session.get(Customer, target_id)
    assert target is not None

    # When only the first tenant's customer is erased
    await CustomerErasureService(session).erase("acme", target)

    # Then the other tenant's rows are untouched
    others = await session.scalars(select(Customer.tenant_id))
    assert set(others.all()) == {"globex"}
    assert await _count(session, Sar) == 1
    assert await _count(session, Attestation) == 1
    assert await _count(session, WhitelistBlacklistMatch) == 1
