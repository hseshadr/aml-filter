"""Unit tests for the Customer SQLAlchemy model and its constraints."""

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import Customer, Tenant


async def _make_tenant(session: AsyncSession, tenant_id: str = "acme") -> None:
    """Insert a tenant row to satisfy the customer foreign key."""
    session.add(Tenant(tenant_id=tenant_id, name="Acme", plan="starter"))
    await session.commit()


@pytest.mark.asyncio
async def test_should_persist_customer_when_minimal_fields_given(session: AsyncSession) -> None:
    # Given
    await _make_tenant(session)
    customer = Customer(
        customer_id="cust-1",
        tenant_id="acme",
        customer_reference="REF-1",
        onboarding_status="DRAFT",
        onboarded_by="officer@acme.com",
    )

    # When
    session.add(customer)
    await session.commit()
    fetched = await session.get(Customer, "cust-1")

    # Then
    assert fetched is not None
    assert fetched.customer_reference == "REF-1"
    assert fetched.onboarding_status == "DRAFT"
    assert fetched.kyc_risk_rating is None
    assert fetched.id_documents == []


@pytest.mark.asyncio
async def test_should_store_id_documents_when_provided(session: AsyncSession) -> None:
    # Given
    await _make_tenant(session)
    docs = [{"doc_type": "PASSPORT", "number": "X1", "issuing_country": "US", "expiry": None}]
    customer = Customer(
        customer_id="cust-2",
        tenant_id="acme",
        customer_reference="REF-2",
        onboarding_status="DRAFT",
        onboarded_by="officer@acme.com",
        id_documents=docs,
    )

    # When
    session.add(customer)
    await session.commit()
    fetched = await session.get(Customer, "cust-2")

    # Then
    assert fetched is not None
    assert fetched.id_documents[0]["doc_type"] == "PASSPORT"


@pytest.mark.asyncio
async def test_should_reject_duplicate_reference_when_same_tenant(session: AsyncSession) -> None:
    # Given
    await _make_tenant(session)
    first = Customer(
        customer_id="cust-3",
        tenant_id="acme",
        customer_reference="DUP",
        onboarding_status="DRAFT",
        onboarded_by="x",
    )
    session.add(first)
    await session.commit()

    # When
    duplicate = Customer(
        customer_id="cust-4",
        tenant_id="acme",
        customer_reference="DUP",
        onboarding_status="DRAFT",
        onboarded_by="x",
    )
    session.add(duplicate)

    # Then
    with pytest.raises(IntegrityError):
        await session.commit()


@pytest.mark.asyncio
async def test_should_allow_same_reference_when_different_tenant(session: AsyncSession) -> None:
    # Given
    await _make_tenant(session, "acme")
    await _make_tenant(session, "globex")

    # When
    session.add(
        Customer(
            customer_id="cust-5",
            tenant_id="acme",
            customer_reference="SHARED",
            onboarding_status="DRAFT",
            onboarded_by="x",
        )
    )
    session.add(
        Customer(
            customer_id="cust-6",
            tenant_id="globex",
            customer_reference="SHARED",
            onboarding_status="DRAFT",
            onboarded_by="x",
        )
    )
    await session.commit()

    # Then
    assert await session.get(Customer, "cust-5") is not None
    assert await session.get(Customer, "cust-6") is not None
