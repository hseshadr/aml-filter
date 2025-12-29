"""Tenant management API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.api.dependencies import get_db_session
from aml_filter.db.models import Tenant
from aml_filter.security.middleware import require_api_key
from sqlalchemy import select

router = APIRouter(prefix="/tenants", tags=["tenants"])


class TenantCreate(BaseModel):
    """Request model for creating a tenant."""

    tenant_id: str = Field(..., min_length=1, max_length=100, description="Unique tenant identifier")
    name: str = Field(..., min_length=1, max_length=500, description="Tenant name")
    plan: str = Field(
        default="starter",
        description="Tenant plan: starter, professional, or enterprise",
    )


class TenantResponse(BaseModel):
    """Response model for tenant."""

    tenant_id: str
    name: str
    plan: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    tenant_data: TenantCreate,
    session: AsyncSession = Depends(get_db_session),
    # Note: Creating tenants might require admin auth, but for now we allow it
) -> TenantResponse:
    """
    Create a new tenant.

    **Note**: In production, this should be restricted to admin users.
    """
    # Check if tenant already exists
    result = await session.execute(select(Tenant).where(Tenant.tenant_id == tenant_data.tenant_id))
    existing = result.scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tenant {tenant_data.tenant_id} already exists",
        )

    # Validate plan
    if tenant_data.plan not in ["starter", "professional", "enterprise"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plan must be one of: starter, professional, enterprise",
        )

    # Create tenant
    tenant = Tenant(
        tenant_id=tenant_data.tenant_id,
        name=tenant_data.name,
        plan=tenant_data.plan,
    )
    session.add(tenant)
    await session.commit()
    await session.refresh(tenant)

    return TenantResponse(
        tenant_id=tenant.tenant_id,
        name=tenant.name,
        plan=tenant.plan,
        created_at=tenant.created_at.isoformat(),
        updated_at=tenant.updated_at.isoformat(),
    )


@router.get("/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: str,
    session: AsyncSession = Depends(get_db_session),
    authenticated_tenant_id: str = Depends(require_api_key),
) -> TenantResponse:
    """
    Get tenant information.

    **Note**: Tenants can only view their own information.
    """
    # Check authorization
    if authenticated_tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    result = await session.execute(select(Tenant).where(Tenant.tenant_id == tenant_id))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant {tenant_id} not found",
        )

    return TenantResponse(
        tenant_id=tenant.tenant_id,
        name=tenant.name,
        plan=tenant.plan,
        created_at=tenant.created_at.isoformat(),
        updated_at=tenant.updated_at.isoformat(),
    )


@router.get("", response_model=list[TenantResponse])
async def list_tenants(
    session: AsyncSession = Depends(get_db_session),
    # Note: In production, this should require admin auth
) -> list[TenantResponse]:
    """
    List all tenants.

    **Note**: In production, this should be restricted to admin users.
    """
    result = await session.execute(select(Tenant).order_by(Tenant.created_at.desc()))
    tenants = result.scalars().all()

    return [
        TenantResponse(
            tenant_id=tenant.tenant_id,
            name=tenant.name,
            plan=tenant.plan,
            created_at=tenant.created_at.isoformat(),
            updated_at=tenant.updated_at.isoformat(),
        )
        for tenant in tenants
    ]

