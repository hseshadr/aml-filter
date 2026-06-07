"""Unit tests for the customer onboarding service."""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.customers.service import OnboardingService
from aml_filter.db.models import Customer, Entity, Tenant
from aml_filter.domain.customer import IdDocument, OnboardingStatus


def _make_entity(entity_id: str | None = None) -> Entity:
    """Build a WHITELIST entity stand-in for the ingestion mock to return."""
    entity_id = entity_id or "whitelist:acme:abc"
    now = datetime.now(UTC)
    return Entity(
        entity_id=entity_id,
        tenant_id="acme",
        entity_type="PERSON",
        primary_name="Jon Q Fakename",
        name_canonical="jon q fakename",
        name_trigram="jon q fakename",
        risk_category="WHITELIST",
        source_list="CUSTOMER_WHITELIST",
        list_version="2026-01-01",
        created_at=now,
        updated_at=now,
    )


def _service(session: AsyncSession, match_ids: list[str]) -> OnboardingService:
    """Build an OnboardingService with mocked ingestion + screening collaborators.

    The ingestion mock persists a real WHITELIST entity (as the production path
    does), so the customer's foreign key to ``entities`` is satisfiable.
    """

    async def _persist_entity(**_kwargs: object) -> Entity:
        entity = _make_entity()
        session.add(entity)
        await session.commit()
        await session.refresh(entity)
        return entity

    ingestion = AsyncMock()
    ingestion.add_customer = AsyncMock(side_effect=_persist_entity)
    screening = AsyncMock()
    screening.screen_entity_against_list = AsyncMock(return_value=match_ids)
    return OnboardingService(session=session, ingestion=ingestion, screening=screening)


def _service_unique_entities(session: AsyncSession) -> OnboardingService:
    """Like ``_service`` but each onboard persists a distinct WHITELIST entity id.

    This lets a duplicate-reference test exercise the customer unique constraint without
    first colliding on the entity primary key.
    """

    async def _persist_entity(**_kwargs: object) -> Entity:
        entity = _make_entity(entity_id=f"whitelist:acme:{uuid.uuid4().hex[:12]}")
        session.add(entity)
        await session.commit()
        await session.refresh(entity)
        return entity

    ingestion = AsyncMock()
    ingestion.add_customer = AsyncMock(side_effect=_persist_entity)
    screening = AsyncMock()
    screening.screen_entity_against_list = AsyncMock(return_value=[])
    return OnboardingService(session=session, ingestion=ingestion, screening=screening)


async def _seed_tenant(session: AsyncSession) -> None:
    """Insert the tenant required by the customer foreign key."""
    session.add(Tenant(tenant_id="acme", name="Acme", plan="starter"))
    await session.commit()


@pytest.mark.asyncio
async def test_should_create_customer_and_entity_when_no_match(session: AsyncSession) -> None:
    # Given
    await _seed_tenant(session)
    service = _service(session, match_ids=[])

    # When
    result = await service.onboard_customer(
        tenant_id="acme",
        customer_reference="REF-1",
        name="Jon Q Fakename",
        onboarded_by="officer@acme.com",
    )

    # Then
    assert result.has_matches is False
    assert result.onboarding_status == OnboardingStatus.PENDING_REVIEW
    stored = await session.get(Customer, result.customer_id)
    assert stored is not None
    assert stored.screening_entity_id == "whitelist:acme:abc"


@pytest.mark.asyncio
async def test_should_flag_matches_when_sanctions_hit(session: AsyncSession) -> None:
    # Given
    await _seed_tenant(session)
    service = _service(session, match_ids=["ofac:sdn:1"])

    # When
    result = await service.onboard_customer(
        tenant_id="acme",
        customer_reference="REF-2",
        name="Jon Q Fakename",
        onboarded_by="officer@acme.com",
    )

    # Then
    assert result.has_matches is True
    assert result.match_entity_ids == ["ofac:sdn:1"]
    assert result.onboarding_status == OnboardingStatus.PENDING_REVIEW


@pytest.mark.asyncio
async def test_should_persist_id_documents_when_supplied(session: AsyncSession) -> None:
    # Given
    await _seed_tenant(session)
    service = _service(session, match_ids=[])
    docs = [IdDocument(doc_type="PASSPORT", number="X1", issuing_country="US")]

    # When
    result = await service.onboard_customer(
        tenant_id="acme",
        customer_reference="REF-3",
        name="Jon Q Fakename",
        onboarded_by="officer@acme.com",
        id_documents=docs,
    )

    # Then
    stored = await session.get(Customer, result.customer_id)
    assert stored is not None
    assert stored.id_documents[0]["doc_type"] == "PASSPORT"


@pytest.mark.asyncio
async def test_should_reject_duplicate_reference_without_orphaning_entity(
    session: AsyncSession,
) -> None:
    # Given an existing customer with a reference, and a fresh onboard reusing it
    from sqlalchemy import func, select

    from aml_filter.customers.errors import DuplicateCustomerReferenceError
    from aml_filter.db.models import Entity

    await _seed_tenant(session)
    first = _service_unique_entities(session)
    await first.onboard_customer(
        tenant_id="acme",
        customer_reference="DUP-REF",
        name="Jon Q Fakename",
        onboarded_by="officer@acme.com",
    )
    entities_before = await session.scalar(select(func.count()).select_from(Entity))

    # When onboarding a second customer with the SAME reference
    second = _service_unique_entities(session)
    with pytest.raises(DuplicateCustomerReferenceError):
        await second.onboard_customer(
            tenant_id="acme",
            customer_reference="DUP-REF",
            name="Someone Else",
            onboarded_by="officer@acme.com",
        )

    # Then it is rejected AND no orphan entity was left behind
    entities_after = await session.scalar(select(func.count()).select_from(Entity))
    assert entities_after == entities_before


@pytest.mark.asyncio
async def test_should_reuse_screening_path_when_onboarding(session: AsyncSession) -> None:
    # Given
    await _seed_tenant(session)
    service = _service(session, match_ids=[])

    # When
    await service.onboard_customer(
        tenant_id="acme",
        customer_reference="REF-4",
        name="Jon Q Fakename",
        onboarded_by="officer@acme.com",
    )

    # Then — onboarding delegates to the existing ingestion + screening services
    service.ingestion.add_customer.assert_awaited_once()
    service.screening.screen_entity_against_list.assert_awaited_once()
