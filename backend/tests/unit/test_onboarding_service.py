"""Unit tests for the customer onboarding service."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.customers.service import OnboardingService
from aml_filter.db.models import Customer, Entity, Tenant
from aml_filter.domain.customer import IdDocument, OnboardingStatus


def _make_entity(entity_id: str = "whitelist:acme:abc") -> Entity:
    """Build a WHITELIST entity stand-in for the ingestion mock to return."""
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
