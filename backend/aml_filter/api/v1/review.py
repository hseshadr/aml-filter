"""Review board API — triage tiered matches and record review decisions.

This sits on top of the screening pipeline: it reads ``WhitelistBlacklistMatch``
rows (already tier-classified by ``MatchTracker``), joins each to its customer and
the matched sanctions entity, and lets a reviewer resolve a match with notes.
"""

from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import Row, ScalarSelect, Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute, aliased

from aml_filter.api.dependencies import get_db_session
from aml_filter.db.models import Customer, Entity, WhitelistBlacklistMatch
from aml_filter.screening.match_tracker import MatchTracker
from aml_filter.security.middleware import require_api_key

router = APIRouter(prefix="/review", tags=["review"])

# Aliases: the match links a whitelist (customer) entity and a blacklist (sanctions) entity.
_WLEntity = aliased(Entity, name="wl_entity")
_BLEntity = aliased(Entity, name="bl_entity")

# (match, customer_id, customer_reference, wl_entity, bl_entity).
_ReviewRowT = tuple[WhitelistBlacklistMatch, str | None, str | None, Entity, Entity]


class ReviewMatchRow(BaseModel):
    """A single tiered match enriched with customer + sanctions-entity context."""

    match_id: str
    tier: str | None
    match_score: float
    match_type: str
    resolution_status: str | None
    reviewer_id: str | None
    review_notes: str | None
    detected_at: str
    customer_id: str | None
    customer_reference: str | None
    customer_name: str | None
    sanctioned_name: str
    source_list: str


class ResolveRequest(BaseModel):
    """Body for resolving a match: who reviewed it and why."""

    reviewer_id: str | None = Field(None, max_length=200)
    review_notes: str | None = None


def _customer_field[T](column: InstrumentedAttribute[T]) -> ScalarSelect[T | None]:
    """Correlated scalar subquery picking one customer column for the match's entity.

    ``customers.screening_entity_id`` has no UNIQUE constraint, so several
    customers may share a screening entity. Selecting via a scalar subquery (vs
    an outer join) keeps the match row from fanning out. When duplicates exist
    the **most-recent** customer wins (``created_at`` desc, then ``customer_id``
    for a deterministic tie-break).
    """
    subquery = (
        select(column)
        .where(Customer.screening_entity_id == WhitelistBlacklistMatch.whitelist_entity_id)
        .order_by(Customer.created_at.desc(), Customer.customer_id.desc())
        .limit(1)
        .correlate(WhitelistBlacklistMatch)
        .scalar_subquery()
    )
    return cast("ScalarSelect[T | None]", subquery)


def _review_query(tenant_id: str) -> Select[_ReviewRowT]:
    """Join matches to their whitelist/blacklist entities, tenant-scoped.

    The customer is read via correlated scalar subqueries (see ``_customer_field``)
    rather than an outer join, so a screening entity shared by multiple customers
    cannot multiply the match row.
    """
    return (
        select(
            WhitelistBlacklistMatch,
            _customer_field(Customer.customer_id).label("customer_id"),
            _customer_field(Customer.customer_reference).label("customer_reference"),
            _WLEntity,
            _BLEntity,
        )
        .join(_BLEntity, _BLEntity.entity_id == WhitelistBlacklistMatch.blacklist_entity_id)
        .join(_WLEntity, _WLEntity.entity_id == WhitelistBlacklistMatch.whitelist_entity_id)
        .where(WhitelistBlacklistMatch.tenant_id == tenant_id)
    )


def _build_row(row: Row[_ReviewRowT]) -> ReviewMatchRow:
    """Map a (match, customer_id, customer_reference, wl, bl) row to the API model."""
    match, customer_id, customer_reference, wl_entity, bl_entity = row
    return ReviewMatchRow(
        match_id=match.match_id,
        tier=match.match_tier,
        match_score=float(match.match_score),
        match_type=match.match_type,
        resolution_status=match.resolution_status,
        reviewer_id=match.reviewer_id,
        review_notes=match.review_notes,
        detected_at=match.detected_at.isoformat(),
        customer_id=customer_id,
        customer_reference=customer_reference,
        customer_name=wl_entity.primary_name,
        sanctioned_name=bl_entity.primary_name,
        source_list=bl_entity.source_list,
    )


def _apply_filters(
    query: Select[_ReviewRowT], tier: str | None, resolution_status: str | None
) -> Select[_ReviewRowT]:
    """Apply optional tier / resolution-status filters to the review query."""
    if tier:
        query = query.where(WhitelistBlacklistMatch.match_tier == tier)
    if resolution_status:
        query = query.where(WhitelistBlacklistMatch.resolution_status == resolution_status)
    return query


@router.get("/matches", response_model=list[ReviewMatchRow])
async def list_review_matches(
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
    tier: str | None = Query(None, pattern="^(STRONG|POSSIBLE|WEAK)$"),
    resolution_status: str | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> list[ReviewMatchRow]:
    """List tiered matches for review, filterable by tier and resolution status."""
    query = _apply_filters(_review_query(tenant_id), tier, resolution_status)
    query = query.order_by(WhitelistBlacklistMatch.match_score.desc()).limit(limit).offset(offset)
    result = await session.execute(query)
    return [_build_row(row) for row in result.all()]


@router.put("/matches/{match_id}/resolve", response_model=ReviewMatchRow)
async def resolve_review_match(
    match_id: str,
    body: ResolveRequest,
    resolution_status: str = Query(..., pattern="^(FALSE_POSITIVE|TRUE_POSITIVE|RESOLVED)$"),
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> ReviewMatchRow:
    """Resolve a match, recording the reviewer and notes."""
    tracker = MatchTracker(session=session)
    match = await tracker.resolve_match(
        match_id=match_id,
        resolution_status=resolution_status,
        tenant_id=tenant_id,
        reviewer_id=body.reviewer_id,
        review_notes=body.review_notes,
    )
    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Match {match_id} not found"
        )
    return await _resolved_row(session, tenant_id, match_id)


async def _resolved_row(session: AsyncSession, tenant_id: str, match_id: str) -> ReviewMatchRow:
    """Re-read the resolved match through the enriched review query.

    The query yields exactly one row per match (customer fields come from scalar
    subqueries, not a fan-out join), so ``one_or_none`` is safe; a missing row
    surfaces as a 404 rather than a 500.
    """
    query = _review_query(tenant_id).where(WhitelistBlacklistMatch.match_id == match_id)
    result = await session.execute(query)
    row = result.one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Match {match_id} not found"
        )
    return _build_row(row)
