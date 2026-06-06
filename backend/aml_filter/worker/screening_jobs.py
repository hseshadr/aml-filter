"""Background job workers for bidirectional screening."""

import logging
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.config import get_settings
from aml_filter.db.mapping import db_to_domain_entity
from aml_filter.db.models import Entity as DBEntity
from aml_filter.db.models import ListVersion, ScreeningJob, Tenant
from aml_filter.db.session import create_database
from aml_filter.domain.entity import Entity
from aml_filter.embedding import EmbeddingService
from aml_filter.ingest.diff import ListDiff, diff_lists
from aml_filter.screening.bidirectional import BidirectionalScreeningService
from aml_filter.screening.delta_rescan import DeltaRescanService
from aml_filter.types import JsonObject

logger = logging.getLogger(__name__)

DEFAULT_SCREENING_THRESHOLD = 0.65
DEFAULT_SCREENING_BATCH_SIZE = 100


def _build_embedding_service() -> EmbeddingService:
    """Construct the embedding service used by the delta path (patched in tests)."""
    return EmbeddingService()


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
    session: AsyncSession,
    job: ScreeningJob,
    *,
    entities_scanned: int,
    matches_found: int,
    mode: str = "full",
) -> JsonObject:
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
        "mode": mode,
    }


async def _finalize_failed(
    session: AsyncSession, job: ScreeningJob, exc: BaseException
) -> JsonObject:
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
    use_delta: bool = True,
) -> JsonObject:
    """Screen whitelist customers against an updated blacklist (delta path when possible).

    When a *prior* ``ListVersion`` of ``list_id`` exists, only the changed entries are
    re-screened (cost scales with the change, not the customer count); otherwise the full
    rescan runs as the correctness fallback.
    """
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
            return await _run_screening(session, job, tenant_id, list_id, list_version, use_delta)
        except Exception as exc:  # noqa: BLE001 — job boundary: must record FAILED status for any error
            return await _finalize_failed(session, job, exc)


async def _run_screening(
    session: AsyncSession,
    job: ScreeningJob,
    tenant_id: str,
    list_id: str | None,
    list_version: str | None,
    use_delta: bool,
) -> JsonObject:
    """Pick the delta path when a prior version exists, else run the full rescan."""
    prior = await _resolve_prior_version(session, list_id, list_version)
    if use_delta and list_id and list_version and prior is not None:
        return await _run_delta(session, job, tenant_id, list_id, list_version, prior)
    return await _run_full(session, job, tenant_id, list_id, list_version)


async def _run_full(
    session: AsyncSession,
    job: ScreeningJob,
    tenant_id: str,
    list_id: str | None,
    list_version: str | None,
) -> JsonObject:
    """The full rescan: re-screen every customer (the correctness fallback)."""
    screening = BidirectionalScreeningService(
        session=session, embedding_service=_build_embedding_service()
    )
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
        mode="full",
    )


async def _run_delta(
    session: AsyncSession,
    job: ScreeningJob,
    tenant_id: str,
    list_id: str,
    list_version: str,
    prior_version: str,
) -> JsonObject:
    """The delta rescan: screen only the changed entries against the customer index."""
    diff = await _compute_diff(session, list_id, prior_version, list_version)
    embedder = _build_embedding_service()
    service = DeltaRescanService(session=session, embedding_service=embedder)
    changed = await _changed_rows(session, list_id, list_version, diff)
    matched = await service.rescan_added_or_modified(tenant_id, changed)
    await service.close_removed(tenant_id, diff.removed)
    scanned = len(diff.added) + len(diff.modified) + len(diff.removed)
    return await _finalize_completed(
        session, job, entities_scanned=scanned, matches_found=len(matched), mode="delta"
    )


async def _resolve_prior_version(
    session: AsyncSession, list_id: str | None, list_version: str | None
) -> str | None:
    """The newest ingested ``ListVersion`` of ``list_id`` other than the current one."""
    if not list_id or not list_version:
        return None
    result = await session.execute(
        select(ListVersion.version)
        .where(ListVersion.list_id == list_id, ListVersion.version != list_version)
        .order_by(ListVersion.ingested_at.desc())
    )
    row = result.scalars().first()
    return row


async def _compute_diff(
    session: AsyncSession, list_id: str, old_version: str, new_version: str
) -> ListDiff:
    """Diff two list snapshots materialized from the entities table by version."""
    old = await _snapshot(session, list_id, old_version)
    new = await _snapshot(session, list_id, new_version)
    return diff_lists(old, new)


async def _snapshot(session: AsyncSession, list_id: str, version: str) -> list[Entity]:
    """Materialize the sanctions entities for one list version as domain entities."""
    result = await session.execute(
        select(DBEntity).where(DBEntity.source_list == list_id, DBEntity.list_version == version)
    )
    return [db_to_domain_entity(e) for e in result.scalars().all()]


async def _changed_rows(
    session: AsyncSession, list_id: str, version: str, diff: ListDiff
) -> list[DBEntity]:
    """Load the DB rows for the added+modified entries (the entries to re-screen)."""
    ids = [e.entity_id for e in (*diff.added, *diff.modified)]
    if not ids:
        return []
    result = await session.execute(
        select(DBEntity).where(
            DBEntity.source_list == list_id,
            DBEntity.list_version == version,
            DBEntity.entity_id.in_(ids),
        )
    )
    return list(result.scalars().all())


async def screen_blacklist_on_whitelist_update(
    tenant_id: str,
    whitelist_entity_id: str | None = None,
    job_id: str | None = None,
) -> JsonObject:
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
) -> JsonObject:
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
