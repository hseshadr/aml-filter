"""Jurisdiction-agnostic SAR builder.

Assembles an immutable ``SubjectSnapshot`` from a customer and its STRONG sanctions
match. Gating is fail-closed: the match must exist, belong to the tenant, be tier
STRONG, and link to the named customer; otherwise ``SarGatingError`` is raised. The
snapshot denormalizes the customer + matched-entity fields so the SAR stays accurate
even if the customer record later changes.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Row, Select, select
from sqlalchemy.orm import aliased

from aml_filter.db.models import Customer, Entity, WhitelistBlacklistMatch
from aml_filter.domain.sar import SubjectSnapshot
from aml_filter.sar.errors import SarGatingError
from aml_filter.scoring.tiers import MatchTier
from aml_filter.types import JsonValue

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

_WLEntity = aliased(Entity, name="sar_wl_entity")
_BLEntity = aliased(Entity, name="sar_bl_entity")

_BuildRowT = tuple[WhitelistBlacklistMatch, Customer, Entity, Entity]


class SarBuilder:
    """Build an immutable SAR subject snapshot from a customer's STRONG match."""

    def __init__(self, session: AsyncSession) -> None:
        """Initialize with an async session."""
        self.session = session

    async def build_snapshot(
        self, tenant_id: str, customer_id: str, match_id: str
    ) -> SubjectSnapshot:
        """Gate on STRONG ownership, then assemble the immutable subject snapshot."""
        row = await self._fetch_row(tenant_id, customer_id, match_id)
        match, customer, wl_entity, bl_entity = _require(row, match_id)
        _require_strong(match)
        return _to_snapshot(customer, wl_entity, bl_entity, match)

    async def _fetch_row(
        self, tenant_id: str, customer_id: str, match_id: str
    ) -> Row[_BuildRowT] | None:
        """Fetch the (match, customer, wl_entity, bl_entity) row, tenant + link scoped."""
        result = await self.session.execute(_build_query(tenant_id, customer_id, match_id))
        return result.one_or_none()


def _build_query(tenant_id: str, customer_id: str, match_id: str) -> Select[_BuildRowT]:
    """Join a match to its customer + entities, scoped by tenant, customer, and link."""
    return (
        select(WhitelistBlacklistMatch, Customer, _WLEntity, _BLEntity)
        .join(_BLEntity, _BLEntity.entity_id == WhitelistBlacklistMatch.blacklist_entity_id)
        .join(_WLEntity, _WLEntity.entity_id == WhitelistBlacklistMatch.whitelist_entity_id)
        .join(Customer, Customer.screening_entity_id == WhitelistBlacklistMatch.whitelist_entity_id)
        .where(
            WhitelistBlacklistMatch.match_id == match_id,
            WhitelistBlacklistMatch.tenant_id == tenant_id,
            Customer.customer_id == customer_id,
            Customer.tenant_id == tenant_id,
        )
    )


def _require(row: Row[_BuildRowT] | None, match_id: str) -> Row[_BuildRowT]:
    """Return the joined row or fail closed when nothing matched the gate."""
    if row is None:
        raise SarGatingError(f"No STRONG-eligible match {match_id} for this customer/tenant")
    return row


def _require_strong(match: WhitelistBlacklistMatch) -> None:
    """Fail closed unless the match is classified STRONG."""
    if match.match_tier != MatchTier.STRONG.value:
        raise SarGatingError(
            f"Match {match.match_id} is tier {match.match_tier}; SAR requires STRONG"
        )


def _to_snapshot(
    customer: Customer,
    wl_entity: Entity,
    bl_entity: Entity,
    match: WhitelistBlacklistMatch,
) -> SubjectSnapshot:
    """Assemble the immutable subject snapshot from the joined rows."""
    return SubjectSnapshot(
        customer_reference=customer.customer_reference,
        customer_name=wl_entity.primary_name,
        customer_dob=list(wl_entity.dob or []),
        customer_identifiers=_identifiers(wl_entity),
        matched_sanctioned_name=bl_entity.primary_name,
        matched_source_list=bl_entity.source_list,
        match_score=float(match.match_score),
        match_tier=str(match.match_tier),
    )


def _identifiers(entity: Entity) -> list[str]:
    """Project the entity's id-document numbers into a flat string list."""
    raw: JsonValue = entity.identifiers.get("id_documents", [])
    if not isinstance(raw, list):
        return []
    return [str(value) for value in raw]
