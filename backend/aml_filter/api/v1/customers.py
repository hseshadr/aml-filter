"""KYC customer onboarding API endpoints (the /v1/customers tier)."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.api.dependencies import get_db_session
from aml_filter.customers.erasure import CustomerErasureService
from aml_filter.customers.errors import DuplicateCustomerReferenceError
from aml_filter.customers.service import OnboardingService
from aml_filter.db.models import Customer
from aml_filter.domain.customer import IdDocument, KycRiskRating, OnboardingStatus
from aml_filter.security.middleware import require_api_key

router = APIRouter(prefix="/customers", tags=["customers"])


class CustomerOnboardRequest(BaseModel):
    """Request body for onboarding a new customer."""

    customer_reference: str = Field(..., min_length=1, max_length=200)
    name: str = Field(..., min_length=1, max_length=500)
    onboarded_by: str = Field(default="api", min_length=1, max_length=200)
    country: str | None = Field(default=None, min_length=2, max_length=2)
    id_documents: list[IdDocument] = Field(default_factory=list)


class CustomerUpdateRequest(BaseModel):
    """Request body for updating a customer's lifecycle fields."""

    onboarding_status: OnboardingStatus | None = None
    kyc_risk_rating: KycRiskRating | None = None
    customer_reference: str | None = Field(default=None, min_length=1, max_length=200)


class CustomerResponse(BaseModel):
    """Read model for a persisted customer row."""

    model_config = ConfigDict(from_attributes=True)

    customer_id: str
    tenant_id: str
    customer_reference: str
    onboarding_status: str
    kyc_risk_rating: str | None
    id_documents: list[IdDocument]
    onboarded_by: str
    screening_entity_id: str | None
    created_at: datetime
    updated_at: datetime


class OnboardResponse(CustomerResponse):
    """Onboarding response: the customer plus any screening matches."""

    match_entity_ids: list[str]


async def list_customers_for_tenant(
    session: AsyncSession, tenant_id: str, limit: int, offset: int
) -> list[Customer]:
    """Fetch a tenant's customers, newest first, paginated."""
    query = (
        select(Customer)
        .where(Customer.tenant_id == tenant_id)
        .order_by(Customer.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(query)
    return list(result.scalars().all())


async def get_customer_for_tenant(
    session: AsyncSession, tenant_id: str, customer_id: str
) -> Customer | None:
    """Fetch a single customer scoped to the owning tenant."""
    result = await session.execute(
        select(Customer).where(
            Customer.customer_id == customer_id,
            Customer.tenant_id == tenant_id,
        )
    )
    return result.scalar_one_or_none()


def _require_customer(customer: Customer | None, customer_id: str) -> Customer:
    """Return the customer or raise a 404 when it is not owned/found."""
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer {customer_id} not found",
        )
    return customer


def _apply_updates(customer: Customer, payload: CustomerUpdateRequest) -> None:
    """Apply provided (non-None) lifecycle fields onto the customer in place."""
    if payload.onboarding_status is not None:
        customer.onboarding_status = payload.onboarding_status.value
    if payload.kyc_risk_rating is not None:
        customer.kyc_risk_rating = payload.kyc_risk_rating.value
    if payload.customer_reference is not None:
        customer.customer_reference = payload.customer_reference


@router.post("", response_model=OnboardResponse, status_code=status.HTTP_201_CREATED)
async def onboard_customer(
    payload: CustomerOnboardRequest,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> OnboardResponse:
    """Onboard a customer: create + link a screened entity, screen, persist matches."""
    service = OnboardingService(session=session)
    try:
        result = await service.onboard_customer(
            tenant_id=tenant_id,
            customer_reference=payload.customer_reference,
            name=payload.name,
            onboarded_by=payload.onboarded_by,
            country=payload.country,
            id_documents=payload.id_documents,
        )
    except DuplicateCustomerReferenceError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    customer = _require_customer(
        await get_customer_for_tenant(session, tenant_id, result.customer_id),
        result.customer_id,
    )
    return OnboardResponse(
        match_entity_ids=result.match_entity_ids,
        **CustomerResponse.model_validate(customer).model_dump(),
    )


@router.get("", response_model=list[CustomerResponse])
async def list_customers(
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> list[Customer]:
    """List the authenticated tenant's customers (paginated)."""
    return await list_customers_for_tenant(
        session=session, tenant_id=tenant_id, limit=limit, offset=offset
    )


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: str,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> Customer:
    """Get a single customer owned by the authenticated tenant."""
    customer = await get_customer_for_tenant(session, tenant_id, customer_id)
    return _require_customer(customer, customer_id)


@router.put("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: str,
    payload: CustomerUpdateRequest,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> Customer:
    """Update a customer's status / risk rating / reference."""
    customer = _require_customer(
        await get_customer_for_tenant(session, tenant_id, customer_id), customer_id
    )
    _apply_updates(customer, payload)
    await session.commit()
    await session.refresh(customer)
    return customer


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: str,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> None:
    """Delete a customer + cascade-erase its PII/screening footprint (right to erasure)."""
    customer = _require_customer(
        await get_customer_for_tenant(session, tenant_id, customer_id), customer_id
    )
    await CustomerErasureService(session).erase(tenant_id, customer)
