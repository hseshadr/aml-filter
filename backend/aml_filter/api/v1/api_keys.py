"""API key management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.api.dependencies import get_db_session
from aml_filter.db.models import ApiKey
from aml_filter.security.api_key import create_api_key, list_api_keys, revoke_api_key
from aml_filter.security.middleware import require_api_key

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


class ApiKeyCreate(BaseModel):
    """Request model for creating an API key."""

    name: str | None = Field(None, max_length=200, description="Optional name for the key")
    expires_in_days: int | None = Field(None, ge=1, description="Optional expiration in days")


class ApiKeyResponse(BaseModel):
    """Response model for API key (without sensitive data)."""

    model_config = ConfigDict(from_attributes=True)

    key_id: str
    name: str | None
    tenant_id: str
    created_at: str
    expires_at: str | None
    revoked_at: str | None
    last_used_at: str | None


class ApiKeyCreateResponse(BaseModel):
    """Response model for newly created API key (includes plaintext key)."""

    key_id: str
    api_key: str  # Plaintext key - show only once!
    name: str | None
    tenant_id: str
    created_at: str
    expires_at: str | None
    expires_in_days: int | None


@router.post("", response_model=ApiKeyCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key_endpoint(
    key_data: ApiKeyCreate,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> ApiKeyCreateResponse:
    """
    Create a new API key for the authenticated tenant.

    **Important**: The plaintext API key is returned only once. Store it securely.
    """
    key_id, plaintext_key = await create_api_key(
        session=session,
        tenant_id=tenant_id,
        name=key_data.name,
        expires_in_days=key_data.expires_in_days,
    )

    # Get the created key to return full details
    result = await session.execute(select(ApiKey).where(ApiKey.key_id == key_id))
    api_key = result.scalar_one()

    return ApiKeyCreateResponse(
        key_id=key_id,
        api_key=plaintext_key,
        name=api_key.name,
        tenant_id=api_key.tenant_id,
        created_at=api_key.created_at.isoformat(),
        expires_at=api_key.expires_at.isoformat() if api_key.expires_at else None,
        expires_in_days=key_data.expires_in_days,
    )


@router.get("", response_model=list[ApiKeyResponse])
async def list_api_keys_endpoint(
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> list[ApiKeyResponse]:
    """List all API keys for the authenticated tenant."""
    api_keys = await list_api_keys(session, tenant_id)

    return [
        ApiKeyResponse(
            key_id=key.key_id,
            name=key.name,
            tenant_id=key.tenant_id,
            created_at=key.created_at.isoformat(),
            expires_at=key.expires_at.isoformat() if key.expires_at else None,
            revoked_at=key.revoked_at.isoformat() if key.revoked_at else None,
            last_used_at=key.last_used_at.isoformat() if key.last_used_at else None,
        )
        for key in api_keys
    ]


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key_endpoint(
    key_id: str,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> None:
    """Revoke an API key."""
    success = await revoke_api_key(session, key_id, tenant_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"API key {key_id} not found or already revoked",
        )
