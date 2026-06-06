"""Review board API — triage tiered matches and record review decisions.

This sits on top of the screening pipeline: it reads ``WhitelistBlacklistMatch``
rows (already tier-classified by ``MatchTracker``), joins each to its customer and
the matched sanctions entity, and lets a reviewer resolve a match with notes.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import Row, Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from aml_filter.api.dependencies import get_db_session
from aml_filter.db.models import Customer, Entity, WhitelistBlacklistMatch
from aml_filter.screening.match_tracker import MatchTracker
from aml_filter.security.middleware import require_api_key

router = APIRouter(prefix="/review", tags=["review"])

# Aliases: the match links a whitelist (customer) entity and a blacklist (sanctions) entity.
_WLEntity = aliased(Entity, name="wl_entity")
_BLEntity = aliased(Entity, name="bl_entity")

_ReviewRowT = tuple[WhitelistBlacklistMatch, Customer, Entity, Entity]


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


def _review_query(tenant_id: str) -> Select[_ReviewRowT]:
    """Join matches to their customer + whitelist/blacklist entities, tenant-scoped."""
    return (
        select(WhitelistBlacklistMatch, Customer, _WLEntity, _BLEntity)
        .join(_BLEntity, _BLEntity.entity_id == WhitelistBlacklistMatch.blacklist_entity_id)
        .join(_WLEntity, _WLEntity.entity_id == WhitelistBlacklistMatch.whitelist_entity_id)
        .outerjoin(
            Customer, Customer.screening_entity_id == WhitelistBlacklistMatch.whitelist_entity_id
        )
        .where(WhitelistBlacklistMatch.tenant_id == tenant_id)
    )


def _build_row(row: Row[_ReviewRowT]) -> ReviewMatchRow:
    """Map a joined (match, customer, wl_entity, bl_entity) row to the API model."""
    match, customer, wl_entity, bl_entity = row
    return ReviewMatchRow(
        match_id=match.match_id,
        tier=match.match_tier,
        match_score=float(match.match_score),
        match_type=match.match_type,
        resolution_status=match.resolution_status,
        reviewer_id=match.reviewer_id,
        review_notes=match.review_notes,
        detected_at=match.detected_at.isoformat(),
        customer_id=customer.customer_id if customer else None,
        customer_reference=customer.customer_reference if customer else None,
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
    """Re-read the resolved match through the enriched review query."""
    query = _review_query(tenant_id).where(WhitelistBlacklistMatch.match_id == match_id)
    result = await session.execute(query)
    return _build_row(result.one())
