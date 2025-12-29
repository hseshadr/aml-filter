"""Scoring policy service for managing tenant policies."""

from typing import Literal, Optional
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import ScoringPolicy, Tenant
from aml_filter.domain.scoring import ScoringPolicy as DomainScoringPolicy, ScoringWeights
from aml_filter.scoring.policy import create_preset_policy

# Valid preset types
PresetType = Literal["strict", "balanced", "lenient", "custom"]


def _normalize_preset(preset: Optional[str]) -> Optional[PresetType]:
    """Normalize preset string to valid Literal type."""
    if preset in ("strict", "balanced", "lenient", "custom"):
        return preset  # type: ignore[return-value]
    return None


async def get_active_policy(
    session: AsyncSession, tenant_id: str
) -> DomainScoringPolicy:
    """
    Get the active scoring policy for a tenant.

    Always returns a policy - either the tenant's active policy or a default balanced policy.
    """
    result = await session.execute(
        select(ScoringPolicy)
        .where(
            ScoringPolicy.tenant_id == tenant_id,
            ScoringPolicy.is_active.is_(True),
        )
        .order_by(ScoringPolicy.version.desc())
    )
    policy = result.scalar_one_or_none()

    if policy:
        return DomainScoringPolicy(
            policy_id=policy.policy_id,
            tenant_id=policy.tenant_id,
            name=policy.name,
            weights=ScoringWeights(**policy.weights),
            threshold=float(policy.threshold),
            version=policy.version,
            preset=_normalize_preset(policy.preset),
        )

    # Return default balanced policy if none exists
    return create_preset_policy("balanced", f"default-{tenant_id}", tenant_id)


async def create_policy(
    session: AsyncSession,
    tenant_id: str,
    name: str,
    weights: ScoringWeights,
    threshold: float,
    preset: Optional[PresetType] = None,
    created_by: Optional[str] = None,
) -> DomainScoringPolicy:
    """Create a new scoring policy for a tenant."""
    # Get next version number
    result = await session.execute(
        select(func.max(ScoringPolicy.version))
        .where(ScoringPolicy.tenant_id == tenant_id)
    )
    max_version = result.scalar_one_or_none() or 0
    next_version = max_version + 1

    # Deactivate all existing policies
    await session.execute(
        select(ScoringPolicy)
        .where(
            ScoringPolicy.tenant_id == tenant_id,
            ScoringPolicy.is_active.is_(True),
        )
    )
    existing_policies = await session.execute(
        select(ScoringPolicy)
        .where(
            ScoringPolicy.tenant_id == tenant_id,
            ScoringPolicy.is_active.is_(True),
        )
    )
    for policy in existing_policies.scalars().all():
        policy.is_active = False

    # Create new policy
    policy_id = f"{tenant_id}-policy-{uuid4().hex[:8]}"
    policy = ScoringPolicy(
        policy_id=policy_id,
        tenant_id=tenant_id,
        name=name,
        weights=weights.model_dump(),
        threshold=threshold,
        version=next_version,
        preset=preset,
        created_by=created_by,
        is_active=True,
    )
    session.add(policy)
    await session.commit()
    await session.refresh(policy)

    return DomainScoringPolicy(
        policy_id=policy.policy_id,
        tenant_id=policy.tenant_id,
        name=policy.name,
        weights=ScoringWeights(**policy.weights),
        threshold=float(policy.threshold),
        version=policy.version,
        preset=_normalize_preset(policy.preset),
    )


async def list_policy_versions(
    session: AsyncSession, tenant_id: str
) -> list[DomainScoringPolicy]:
    """List all policy versions for a tenant."""
    result = await session.execute(
        select(ScoringPolicy)
        .where(ScoringPolicy.tenant_id == tenant_id)
        .order_by(ScoringPolicy.version.desc())
    )
    policies = result.scalars().all()

    return [
        DomainScoringPolicy(
            policy_id=p.policy_id,
            tenant_id=p.tenant_id,
            name=p.name,
            weights=ScoringWeights(**p.weights),
            threshold=float(p.threshold),
            version=p.version,
            preset=_normalize_preset(p.preset),
        )
        for p in policies
    ]


async def rollback_to_version(
    session: AsyncSession, tenant_id: str, version: int
) -> DomainScoringPolicy:
    """Rollback to a specific policy version."""
    result = await session.execute(
        select(ScoringPolicy).where(
            ScoringPolicy.tenant_id == tenant_id,
            ScoringPolicy.version == version,
        )
    )
    policy = result.scalar_one_or_none()

    if not policy:
        raise ValueError(f"Policy version {version} not found for tenant {tenant_id}")

    # Deactivate all existing policies
    existing_policies = await session.execute(
        select(ScoringPolicy)
        .where(
            ScoringPolicy.tenant_id == tenant_id,
            ScoringPolicy.is_active.is_(True),
        )
    )
    for p in existing_policies.scalars().all():
        p.is_active = False

    # Activate the selected version
    policy.is_active = True
    await session.commit()
    await session.refresh(policy)

    return DomainScoringPolicy(
        policy_id=policy.policy_id,
        tenant_id=policy.tenant_id,
        name=policy.name,
        weights=ScoringWeights(**policy.weights),
        threshold=float(policy.threshold),
        version=policy.version,
        preset=_normalize_preset(policy.preset),
    )


async def initialize_default_policy(
    session: AsyncSession, tenant_id: str
) -> DomainScoringPolicy:
    """Initialize default policy for a new tenant."""
    return await create_policy(
        session=session,
        tenant_id=tenant_id,
        name="Default Balanced Policy",
        weights=ScoringWeights(),  # Uses default balanced weights
        threshold=0.65,
        preset="balanced",
    )

