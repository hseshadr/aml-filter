"""Scoring policy/weights management API endpoints."""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.api.dependencies import get_db_session
from aml_filter.domain.scoring import ScoringWeights
from aml_filter.scoring.policy import create_preset_policy
from aml_filter.scoring.service import (
    PresetType,
    create_policy,
    get_active_policy,
    list_policy_versions,
    rollback_to_version,
)
from aml_filter.security.middleware import require_api_key

router = APIRouter(prefix="/weights", tags=["weights"])


class WeightsResponse(BaseModel):
    """Response model for scoring weights."""

    policy_id: str
    tenant_id: str
    name: str
    weights: ScoringWeights
    threshold: float
    version: int
    preset: Optional[str] = None

    class Config:
        from_attributes = True


class WeightsUpdate(BaseModel):
    """Request model for updating weights."""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    weights: Optional[ScoringWeights] = None
    threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    preset: Optional[str] = Field(None, pattern="^(strict|balanced|lenient|custom)$")


class PolicyVersionResponse(BaseModel):
    """Response model for policy version."""

    policy_id: str
    tenant_id: str
    name: str
    weights: ScoringWeights
    threshold: float
    version: int
    preset: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True


class RollbackRequest(BaseModel):
    """Request model for rolling back to a version."""

    version: int = Field(..., ge=1)


@router.get("", response_model=WeightsResponse)
async def get_current_weights(
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> WeightsResponse:
    """Get the current active scoring policy for the tenant."""
    policy = await get_active_policy(session, tenant_id)

    return WeightsResponse(
        policy_id=policy.policy_id,
        tenant_id=policy.tenant_id,
        name=policy.name,
        weights=policy.weights,
        threshold=policy.threshold,
        version=policy.version,
        preset=policy.preset,
    )


@router.put("", response_model=WeightsResponse)
async def update_weights(
    update: WeightsUpdate,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> WeightsResponse:
    """Update the scoring policy for the tenant."""
    current_policy = await get_active_policy(session, tenant_id)

    # Determine weights
    preset: PresetType = "custom"
    weights: ScoringWeights
    if update.preset and update.preset in ("strict", "balanced", "lenient"):
        # Use preset - these are the valid preset types for create_preset_policy
        preset_val: Literal["strict", "balanced", "lenient"] = update.preset  # type: ignore[assignment]
        preset_policy = create_preset_policy(preset_val, f"{preset_val}-policy", tenant_id)
        weights = preset_policy.weights
        preset = preset_val
    elif update.weights:
        # Use custom weights
        weights = update.weights
        preset = "custom"
    else:
        # Keep current weights
        weights = current_policy.weights
        preset = current_policy.preset or "custom"

    # Determine threshold
    threshold = update.threshold if update.threshold is not None else current_policy.threshold

    # Determine name
    name = update.name or current_policy.name

    # Create new policy version
    new_policy = await create_policy(
        session=session,
        tenant_id=tenant_id,
        name=name,
        weights=weights,
        threshold=threshold,
        preset=preset,
        created_by=tenant_id,  # In production, use actual user ID
    )

    return WeightsResponse(
        policy_id=new_policy.policy_id,
        tenant_id=new_policy.tenant_id,
        name=new_policy.name,
        weights=new_policy.weights,
        threshold=new_policy.threshold,
        version=new_policy.version,
        preset=new_policy.preset,
    )


@router.get("/history", response_model=list[PolicyVersionResponse])
async def get_policy_history(
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> list[PolicyVersionResponse]:
    """Get the version history of scoring policies."""
    from aml_filter.db.models import ScoringPolicy

    policies = await list_policy_versions(session, tenant_id)

    # Get active status
    result = await session.execute(
        select(ScoringPolicy)
        .where(
            ScoringPolicy.tenant_id == tenant_id,
            ScoringPolicy.is_active.is_(True),
        )
    )
    active_policy = result.scalar_one_or_none()

    return [
        PolicyVersionResponse(
            policy_id=p.policy_id,
            tenant_id=p.tenant_id,
            name=p.name,
            weights=p.weights,
            threshold=p.threshold,
            version=p.version,
            preset=p.preset,
            is_active=active_policy is not None and active_policy.policy_id == p.policy_id,
        )
        for p in policies
    ]


@router.post("/rollback", response_model=WeightsResponse)
async def rollback_policy(
    request: RollbackRequest,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> WeightsResponse:
    """Rollback to a specific policy version."""
    try:
        policy = await rollback_to_version(session, tenant_id, request.version)
        return WeightsResponse(
            policy_id=policy.policy_id,
            tenant_id=policy.tenant_id,
            name=policy.name,
            weights=policy.weights,
            threshold=policy.threshold,
            version=policy.version,
            preset=policy.preset,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        ) from e

