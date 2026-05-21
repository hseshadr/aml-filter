"""Background job workers for bidirectional screening."""

import logging
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.config import get_settings
from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import ScreeningJob, Tenant
from aml_filter.db.session import create_database
from aml_filter.screening.bidirectional import BidirectionalScreeningService

logger = logging.getLogger(__name__)

DEFAULT_SCREENING_THRESHOLD = 0.65
DEFAULT_SCREENING_BATCH_SIZE = 100


@asynccontextmanager
async def _open_session() -> AsyncIterator[AsyncSession]:
    """Open an async session against the configured database (worker entrypoint)."""
    database_url = get_settings().database_url
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is required")
    database = create_database(database_url)
    async with database.async_session_maker() as session:
        yield session


async def _load_or_create_job(
    session: AsyncSession,
    *,
    job_id: str | None,
    tenant_id: str | None,
    job_type: str,
    trigger_type: str,
    list_id: str | None = None,
    list_version: str | None = None,
) -> ScreeningJob:
    """Load an existing ScreeningJob by id, or create a new RUNNING one."""
    if job_id:
        result = await session.execute(select(ScreeningJob).where(ScreeningJob.job_id == job_id))
        job = result.scalar_one_or_none()
        if job is None:
            raise RuntimeError(f"Job {job_id} not found")
        return job
    job = ScreeningJob(
        job_id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        job_type=job_type,
        trigger_type=trigger_type,
        list_id=list_id,
        list_version=list_version,
        status="RUNNING",
        started_at=datetime.now(UTC),
    )
    session.add(job)
    await session.commit()
    return job


async def _finalize_completed(
    session: AsyncSession, job: ScreeningJob, *, entities_scanned: int, matches_found: int
) -> dict[str, Any]:
    """Mark job COMPLETED, persist counts, and return the job summary."""
    job.status = "COMPLETED"
    job.completed_at = datetime.now(UTC)
    job.entities_scanned = entities_scanned
    job.matches_found = matches_found
    await session.commit()
    return {
        "job_id": job.job_id,
        "status": "completed",
        "entities_scanned": entities_scanned,
        "matches_found": matches_found,
    }


async def _finalize_failed(
    session: AsyncSession, job: ScreeningJob, exc: BaseException
) -> dict[str, Any]:
    """Mark job FAILED, persist the error message, and return the job summary."""
    logger.exception("Screening job %s failed", job.job_id)
    job.status = "FAILED"
    job.completed_at = datetime.now(UTC)
    job.error_message = str(exc)
    await session.commit()
    return {"job_id": job.job_id, "status": "failed", "error": str(exc)}


async def screen_whitelist_on_blacklist_update(
    tenant_id: str,
    list_id: str | None = None,
    list_version: str | None = None,
    job_id: str | None = None,
) -> dict[str, Any]:
    """Screen all whitelist customers against an updated blacklist."""
    async with _open_session() as session:
        job = await _load_or_create_job(
            session,
            job_id=job_id,
            tenant_id=tenant_id,
            job_type="WHITELIST_SCAN",
            trigger_type="LIST_UPDATE",
            list_id=list_id,
            list_version=list_version,
        )
        try:
            screening = BidirectionalScreeningService(session=session)
            results = await screening.screen_whitelist_against_blacklist(
                tenant_id=tenant_id,
                list_id=list_id,
                list_version=list_version,
                threshold=DEFAULT_SCREENING_THRESHOLD,
                batch_size=DEFAULT_SCREENING_BATCH_SIZE,
            )
            return await _finalize_completed(
                session,
                job,
                entities_scanned=results["entities_scanned"],
                matches_found=results["matches_found"],
            )
        except Exception as exc:  # noqa: BLE001 — job boundary: must record FAILED status for any error
            return await _finalize_failed(session, job, exc)


async def screen_blacklist_on_whitelist_update(
    tenant_id: str,
    whitelist_entity_id: str | None = None,
    job_id: str | None = None,
) -> dict[str, Any]:
    """Screen a new/updated whitelist customer against all blacklists."""
    async with _open_session() as session:
        job = await _load_or_create_job(
            session,
            job_id=job_id,
            tenant_id=tenant_id,
            job_type="BLACKLIST_SCAN",
            trigger_type="LIST_UPDATE",
        )
        try:
            screening = BidirectionalScreeningService(session=session)
            if whitelist_entity_id:
                entities_scanned, matches_found = await _screen_single_whitelist_entity(
                    session, screening, whitelist_entity_id, tenant_id
                )
            else:
                results = await screening.screen_whitelist_against_blacklist(
                    tenant_id=tenant_id,
                    threshold=DEFAULT_SCREENING_THRESHOLD,
                    batch_size=DEFAULT_SCREENING_BATCH_SIZE,
                )
                entities_scanned = results["entities_scanned"]
                matches_found = results["matches_found"]
            return await _finalize_completed(
                session, job, entities_scanned=entities_scanned, matches_found=matches_found
            )
        except Exception as exc:  # noqa: BLE001 — job boundary: must record FAILED status for any error
            return await _finalize_failed(session, job, exc)


async def _screen_single_whitelist_entity(
    session: AsyncSession,
    screening: BidirectionalScreeningService,
    whitelist_entity_id: str,
    tenant_id: str,
) -> tuple[int, int]:
    """Screen a single whitelist entity against blacklists. Returns (scanned, matched)."""
    result = await session.execute(
        select(DBEntity).where(DBEntity.entity_id == whitelist_entity_id)
    )
    entity = result.scalar_one_or_none()
    if entity is None:
        return 0, 0
    matches = await screening.screen_entity_against_list(
        entity=entity,
        target_risk_category="SANCTION",
        threshold=DEFAULT_SCREENING_THRESHOLD,
        match_type="WHITELIST_VS_BLACKLIST",
        tenant_id=tenant_id,
    )
    return 1, len(matches)


async def run_bidirectional_screening(
    tenant_id: str | None = None,
    job_id: str | None = None,
) -> dict[str, Any]:
    """Run full bidirectional screening for all tenants, or a specific tenant."""
    async with _open_session() as session:
        job = await _load_or_create_job(
            session,
            job_id=job_id,
            tenant_id=tenant_id,
            job_type="BIDIRECTIONAL",
            trigger_type="MANUAL",
        )
        try:
            screening = BidirectionalScreeningService(session=session)
            scanned, matched = await _run_screening_for_tenants(session, screening, tenant_id)
            return await _finalize_completed(
                session, job, entities_scanned=scanned, matches_found=matched
            )
        except Exception as exc:  # noqa: BLE001 — job boundary: must record FAILED status for any error
            return await _finalize_failed(session, job, exc)


async def _run_screening_for_tenants(
    session: AsyncSession,
    screening: BidirectionalScreeningService,
    tenant_id: str | None,
) -> tuple[int, int]:
    """Run screening for one tenant or all tenants. Returns (scanned, matched)."""
    if tenant_id:
        results = await screening.screen_whitelist_against_blacklist(
            tenant_id=tenant_id,
            threshold=DEFAULT_SCREENING_THRESHOLD,
            batch_size=DEFAULT_SCREENING_BATCH_SIZE,
        )
        return results["entities_scanned"], results["matches_found"]
    tenants = (await session.execute(select(Tenant))).scalars().all()
    total_scanned = 0
    total_matched = 0
    for tenant in tenants:
        results = await screening.screen_whitelist_against_blacklist(
            tenant_id=tenant.tenant_id,
            threshold=DEFAULT_SCREENING_THRESHOLD,
            batch_size=DEFAULT_SCREENING_BATCH_SIZE,
        )
        total_scanned += results["entities_scanned"]
        total_matched += results["matches_found"]
    return total_scanned, total_matched
