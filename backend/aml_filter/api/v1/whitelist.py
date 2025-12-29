"""Whitelist management API endpoints."""

import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.api.dependencies import get_db_session
from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import ScreeningJob
from aml_filter.ingest.whitelist import WhitelistIngestionService
from aml_filter.screening.bidirectional import BidirectionalScreeningService
from aml_filter.screening.match_tracker import MatchTracker
from aml_filter.security.middleware import require_api_key

router = APIRouter(prefix="/whitelist", tags=["whitelist"])


def _format_dates(dates: list[date] | None) -> list[str] | None:
    """Format a list of dates to ISO format strings."""
    if dates is None:
        return None
    return [d.isoformat() for d in dates]


class CustomerCreate(BaseModel):
    """Request model for creating a whitelist customer."""

    name: str = Field(..., min_length=1, max_length=500)
    entity_type: str = Field(default="PERSON", pattern="^(PERSON|ORGANIZATION)$")
    dob: list[date] | None = Field(None, description="List of dates of birth")
    country: str | None = Field(None, min_length=2, max_length=2, description="ISO 3166-1 alpha-2 country code")
    aliases: list[dict[str, Any]] | None = Field(None, description="List of aliases")
    identifiers: dict[str, Any] | None = Field(None, description="Identifiers dictionary")
    metadata: dict[str, Any] | None = Field(None, description="Optional metadata")


class CustomerUpdate(BaseModel):
    """Request model for updating a whitelist customer."""

    name: str | None = Field(None, min_length=1, max_length=500)
    entity_type: str | None = Field(None, pattern="^(PERSON|ORGANIZATION)$")
    dob: list[date] | None = None
    country: str | None = Field(None, min_length=2, max_length=2)
    aliases: list[dict[str, Any]] | None = None
    identifiers: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None


class CustomerResponse(BaseModel):
    """Response model for whitelist customer."""

    model_config = ConfigDict(from_attributes=True)

    entity_id: str
    tenant_id: str
    entity_type: str
    primary_name: str
    name_canonical: str
    dob: list[str] | None
    countries: list[str] | None
    aliases: list[dict[str, Any]]
    identifiers: dict[str, Any]
    created_at: str
    updated_at: str


class MatchResponse(BaseModel):
    """Response model for whitelist-blacklist match."""

    model_config = ConfigDict(from_attributes=True)

    match_id: str
    tenant_id: str
    whitelist_entity_id: str
    blacklist_entity_id: str
    match_score: float
    match_type: str
    list_version: str | None
    detected_at: str
    resolution_status: str | None
    resolved_at: str | None


class ScreeningJobResponse(BaseModel):
    """Response model for screening job."""

    model_config = ConfigDict(from_attributes=True)

    job_id: str
    tenant_id: str | None
    job_type: str
    trigger_type: str | None
    status: str
    entities_scanned: int
    matches_found: int
    started_at: str | None
    completed_at: str | None
    error_message: str | None


@router.post("/customers", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def add_customer(
    customer: CustomerCreate,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> CustomerResponse:
    """Add a customer to the whitelist."""
    ingestion_service = WhitelistIngestionService(session=session)

    entity = await ingestion_service.add_customer(
        tenant_id=tenant_id,
        name=customer.name,
        entity_type=customer.entity_type,
        dob=customer.dob,
        country=customer.country,
        aliases=customer.aliases,
        identifiers=customer.identifiers,
        metadata=customer.metadata,
    )

    return CustomerResponse(
        entity_id=entity.entity_id,
        tenant_id=entity.tenant_id or "",
        entity_type=entity.entity_type,
        primary_name=entity.primary_name,
        name_canonical=entity.name_canonical,
        dob=_format_dates(entity.dob),
        countries=entity.countries,
        aliases=entity.aliases or [],
        identifiers=entity.identifiers or {},
        created_at=entity.created_at.isoformat(),
        updated_at=entity.updated_at.isoformat(),
    )


@router.get("/customers", response_model=list[CustomerResponse])
async def list_customers(
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> list[CustomerResponse]:
    """List whitelist customers for the authenticated tenant."""
    ingestion_service = WhitelistIngestionService(session=session)
    entities = await ingestion_service.list_customers(
        tenant_id=tenant_id,
        limit=limit,
        offset=offset,
    )

    return [
        CustomerResponse(
            entity_id=entity.entity_id,
            tenant_id=entity.tenant_id or "",
            entity_type=entity.entity_type,
            primary_name=entity.primary_name,
            name_canonical=entity.name_canonical,
            dob=_format_dates(entity.dob),
            countries=entity.countries,
            aliases=entity.aliases or [],
            identifiers=entity.identifiers or {},
            created_at=entity.created_at.isoformat(),
            updated_at=entity.updated_at.isoformat(),
        )
        for entity in entities
    ]


@router.get("/customers/{entity_id}", response_model=CustomerResponse)
async def get_customer(
    entity_id: str,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> CustomerResponse:
    """Get a specific whitelist customer."""
    result = await session.execute(
        select(DBEntity).where(
            DBEntity.entity_id == entity_id,
            DBEntity.tenant_id == tenant_id,
            DBEntity.risk_category == "WHITELIST",
        )
    )
    entity = result.scalar_one_or_none()
    if entity is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer {entity_id} not found",
        )

    return CustomerResponse(
        entity_id=entity.entity_id,
        tenant_id=entity.tenant_id or "",
        entity_type=entity.entity_type,
        primary_name=entity.primary_name,
        name_canonical=entity.name_canonical,
        dob=_format_dates(entity.dob),
        countries=entity.countries,
        aliases=entity.aliases or [],
        identifiers=entity.identifiers or {},
        created_at=entity.created_at.isoformat(),
        updated_at=entity.updated_at.isoformat(),
    )


@router.put("/customers/{entity_id}", response_model=CustomerResponse)
async def update_customer(
    entity_id: str,
    customer: CustomerUpdate,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> CustomerResponse:
    """Update a whitelist customer."""
    result = await session.execute(
        select(DBEntity).where(
            DBEntity.entity_id == entity_id,
            DBEntity.tenant_id == tenant_id,
            DBEntity.risk_category == "WHITELIST",
        )
    )
    entity = result.scalar_one_or_none()
    if entity is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer {entity_id} not found",
        )

    # Update fields if provided
    if customer.name is not None:
        entity.primary_name = customer.name
    if customer.entity_type is not None:
        entity.entity_type = customer.entity_type
    if customer.dob is not None:
        entity.dob = customer.dob
    if customer.country is not None:
        entity.countries = [customer.country] if customer.country else []
    if customer.aliases is not None:
        entity.aliases = customer.aliases
    if customer.identifiers is not None:
        entity.identifiers = customer.identifiers
    if customer.metadata is not None:
        entity.raw_source = customer.metadata

    await session.commit()
    await session.refresh(entity)

    return CustomerResponse(
        entity_id=entity.entity_id,
        tenant_id=entity.tenant_id or "",
        entity_type=entity.entity_type,
        primary_name=entity.primary_name,
        name_canonical=entity.name_canonical,
        dob=_format_dates(entity.dob),
        countries=entity.countries,
        aliases=entity.aliases or [],
        identifiers=entity.identifiers or {},
        created_at=entity.created_at.isoformat(),
        updated_at=entity.updated_at.isoformat(),
    )


@router.delete("/customers/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    entity_id: str,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> None:
    """Delete a whitelist customer."""
    ingestion_service = WhitelistIngestionService(session=session)
    deleted = await ingestion_service.delete_customer(tenant_id=tenant_id, entity_id=entity_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer {entity_id} not found",
        )


@router.post("/screen", response_model=ScreeningJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def trigger_screening(
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> ScreeningJobResponse:
    """Trigger bidirectional screening for the authenticated tenant."""
    # Create job record
    job_id = str(uuid.uuid4())
    job = ScreeningJob(
        job_id=job_id,
        tenant_id=tenant_id,
        job_type="BIDIRECTIONAL",
        trigger_type="MANUAL",
        status="PENDING",
    )
    session.add(job)
    await session.commit()

    # Enqueue background job
    try:
        import os

        from redis import Redis
        from rq import Queue

        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        redis_conn = Redis.from_url(redis_url)
        queue = Queue("screening", connection=redis_conn)

        queue.enqueue(
            "aml_filter.worker.screening_jobs.run_bidirectional_screening",
            tenant_id=tenant_id,
            job_id=job_id,
        )
    except Exception:
        # If Redis/RQ is not available, run synchronously
        screening_service = BidirectionalScreeningService(session=session)
        results = await screening_service.screen_whitelist_against_blacklist(
            tenant_id=tenant_id,
            threshold=0.65,
            batch_size=100,
        )

        job.status = "COMPLETED"
        job.entities_scanned = results["entities_scanned"]
        job.matches_found = results["matches_found"]
        await session.commit()

    await session.refresh(job)

    return ScreeningJobResponse(
        job_id=job.job_id,
        tenant_id=job.tenant_id,
        job_type=job.job_type,
        trigger_type=job.trigger_type,
        status=job.status,
        entities_scanned=job.entities_scanned,
        matches_found=job.matches_found,
        started_at=job.started_at.isoformat() if job.started_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        error_message=job.error_message,
    )


@router.get("/matches", response_model=list[MatchResponse])
async def get_matches(
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
    resolution_status: str | None = Query(None, description="Filter by resolution status"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> list[MatchResponse]:
    """Get matches for the authenticated tenant."""
    match_tracker = MatchTracker(session=session)
    matches = await match_tracker.get_matches_for_tenant(
        tenant_id=tenant_id,
        resolution_status=resolution_status,
        limit=limit,
        offset=offset,
    )

    return [
        MatchResponse(
            match_id=match.match_id,
            tenant_id=match.tenant_id,
            whitelist_entity_id=match.whitelist_entity_id,
            blacklist_entity_id=match.blacklist_entity_id,
            match_score=float(match.match_score),
            match_type=match.match_type,
            list_version=match.list_version,
            detected_at=match.detected_at.isoformat(),
            resolution_status=match.resolution_status,
            resolved_at=match.resolved_at.isoformat() if match.resolved_at else None,
        )
        for match in matches
    ]


@router.put("/matches/{match_id}/resolve", response_model=MatchResponse)
async def resolve_match(
    match_id: str,
    resolution_status: str = Query(..., pattern="^(FALSE_POSITIVE|TRUE_POSITIVE|RESOLVED)$"),
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> MatchResponse:
    """Resolve a match."""
    match_tracker = MatchTracker(session=session)
    match = await match_tracker.resolve_match(
        match_id=match_id,
        resolution_status=resolution_status,
        tenant_id=tenant_id,
    )

    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Match {match_id} not found",
        )

    return MatchResponse(
        match_id=match.match_id,
        tenant_id=match.tenant_id,
        whitelist_entity_id=match.whitelist_entity_id,
        blacklist_entity_id=match.blacklist_entity_id,
        match_score=float(match.match_score),
        match_type=match.match_type,
        list_version=match.list_version,
        detected_at=match.detected_at.isoformat(),
        resolution_status=match.resolution_status,
        resolved_at=match.resolved_at.isoformat() if match.resolved_at else None,
    )


@router.get("/screening-jobs", response_model=list[ScreeningJobResponse])
async def list_screening_jobs(
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
    status_filter: str | None = Query(None, alias="status", description="Filter by job status"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> list[ScreeningJobResponse]:
    """List screening jobs for the authenticated tenant."""
    query = select(ScreeningJob).where(ScreeningJob.tenant_id == tenant_id)

    if status_filter:
        query = query.where(ScreeningJob.status == status_filter)

    query = query.order_by(ScreeningJob.started_at.desc()).limit(limit).offset(offset)

    result = await session.execute(query)
    jobs = result.scalars().all()

    return [
        ScreeningJobResponse(
            job_id=job.job_id,
            tenant_id=job.tenant_id,
            job_type=job.job_type,
            trigger_type=job.trigger_type,
            status=job.status,
            entities_scanned=job.entities_scanned,
            matches_found=job.matches_found,
            started_at=job.started_at.isoformat() if job.started_at else None,
            completed_at=job.completed_at.isoformat() if job.completed_at else None,
            error_message=job.error_message,
        )
        for job in jobs
    ]


@router.get("/screening-jobs/{job_id}", response_model=ScreeningJobResponse)
async def get_screening_job(
    job_id: str,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> ScreeningJobResponse:
    """Get a specific screening job."""
    result = await session.execute(
        select(ScreeningJob).where(
            ScreeningJob.job_id == job_id,
            ScreeningJob.tenant_id == tenant_id,
        )
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Screening job {job_id} not found",
        )

    return ScreeningJobResponse(
        job_id=job.job_id,
        tenant_id=job.tenant_id,
        job_type=job.job_type,
        trigger_type=job.trigger_type,
        status=job.status,
        entities_scanned=job.entities_scanned,
        matches_found=job.matches_found,
        started_at=job.started_at.isoformat() if job.started_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        error_message=job.error_message,
    )

