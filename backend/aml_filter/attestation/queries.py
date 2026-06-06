"""Tenant-scoped queries backing the attestation service.

Kept separate from the service so each query is a small, named, testable unit:
the enabled-lists-and-versions snapshot, a customer's match summary, the latest
attestation per customer, and the "due for re-review" staleness set.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import (
    Attestation,
    Customer,
    ListVersion,
    TenantListConfig,
    WhitelistBlacklistMatch,
)
from aml_filter.domain.attestation import ListVersionEntry

_RESOLVED = "PENDING"


async def enabled_list_versions(session: AsyncSession, tenant_id: str) -> list[ListVersionEntry]:
    """Snapshot the tenant's enabled lists at their currently-ACTIVE versions."""
    result = await session.execute(_enabled_versions_query(tenant_id))
    return [ListVersionEntry(list_id=row.list_id, version=row.version) for row in result]


def _enabled_versions_query(tenant_id: str) -> Select[tuple[str, str]]:
    """Join enabled tenant lists to their ACTIVE list version."""
    return (
        select(TenantListConfig.list_id, ListVersion.version)
        .join(ListVersion, ListVersion.list_id == TenantListConfig.list_id)
        .where(
            TenantListConfig.tenant_id == tenant_id,
            TenantListConfig.enabled.is_(True),
            ListVersion.status == "ACTIVE",
        )
        .order_by(TenantListConfig.list_id)
    )


async def match_counts(
    session: AsyncSession, tenant_id: str, screening_entity_id: str | None
) -> tuple[int, int]:
    """Return ``(total_matches, pending_matches)`` for a customer's whitelist entity."""
    if screening_entity_id is None:
        return (0, 0)
    result = await session.execute(_match_counts_query(tenant_id, screening_entity_id))
    total, pending = result.one()
    return (int(total), int(pending))


def _match_counts_query(tenant_id: str, entity_id: str) -> Select[tuple[int, int]]:
    """Count total and still-pending matches against a customer's whitelist entity."""
    pending = func.count().filter(WhitelistBlacklistMatch.resolution_status == _RESOLVED)
    return select(func.count(), pending).where(
        WhitelistBlacklistMatch.tenant_id == tenant_id,
        WhitelistBlacklistMatch.whitelist_entity_id == entity_id,
    )


def latest_attestation_ids(tenant_id: str) -> Select[tuple[str]]:
    """Subquery: the newest attestation_id per customer for a tenant."""
    newest = (
        select(
            Attestation.attestation_id,
            func.row_number()
            .over(
                partition_by=Attestation.customer_id,
                order_by=Attestation.created_at.desc(),
            )
            .label("rn"),
        )
        .where(Attestation.tenant_id == tenant_id)
        .subquery()
    )
    return select(newest.c.attestation_id).where(newest.c.rn == 1)


def stale_customers_query(tenant_id: str, now: datetime) -> Select[tuple[Customer]]:
    """Active customers whose latest attestation is missing or expired."""
    fresh = (
        select(Attestation.customer_id)
        .where(Attestation.tenant_id == tenant_id, Attestation.valid_until > now)
        .distinct()
    )
    return select(Customer).where(
        Customer.tenant_id == tenant_id,
        Customer.onboarding_status == "ACTIVE",
        Customer.customer_id.notin_(fresh),
    )
