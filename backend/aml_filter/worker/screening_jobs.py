"""Background job workers for bidirectional screening."""

import uuid
from datetime import datetime
from typing import Any, Optional

try:
    from dotenv import find_dotenv, load_dotenv

    load_dotenv(find_dotenv(), override=False)
except Exception:
    pass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import ScreeningJob, Tenant
from aml_filter.db.session import create_database
from aml_filter.screening.bidirectional import BidirectionalScreeningService




async def screen_whitelist_on_blacklist_update(
    tenant_id: str,
    list_id: Optional[str] = None,
    list_version: Optional[str] = None,
    job_id: Optional[str] = None,
) -> dict[str, Any]:
    """
    Screen all whitelist customers against updated blacklist.

    This is a background job that should be enqueued when a blacklist is updated.

    Args:
        tenant_id: Tenant ID
        list_id: Optional specific list ID that was updated
        list_version: Optional specific list version
        job_id: Optional job ID (will be created if not provided)

    Returns:
        Dictionary with job results
    """
    import os

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is required")
    database = create_database(database_url)

    async with database.async_session_maker() as session:
        # Create or update job record
        job: ScreeningJob
        if job_id:
            result = await session.execute(
                select(ScreeningJob).where(ScreeningJob.job_id == job_id)
            )
            existing_job = result.scalar_one_or_none()
            if existing_job is None:
                raise RuntimeError(f"Job {job_id} not found")
            job = existing_job
        else:
            job_id = str(uuid.uuid4())
            job = ScreeningJob(
                job_id=job_id,
                tenant_id=tenant_id,
                job_type="WHITELIST_SCAN",
                trigger_type="LIST_UPDATE",
                list_id=list_id,
                list_version=list_version,
                status="RUNNING",
                started_at=datetime.utcnow(),
            )
            session.add(job)
            await session.commit()

        try:
            # Initialize screening service
            screening_service = BidirectionalScreeningService(session=session)

            # Run screening
            results = await screening_service.screen_whitelist_against_blacklist(
                tenant_id=tenant_id,
                list_id=list_id,
                list_version=list_version,
                threshold=0.65,
                batch_size=100,
            )

            # Update job record
            job.status = "COMPLETED"
            job.completed_at = datetime.utcnow()
            job.entities_scanned = results["entities_scanned"]
            job.matches_found = results["matches_found"]
            await session.commit()

            return {
                "job_id": job_id,
                "status": "completed",
                "entities_scanned": results["entities_scanned"],
                "matches_found": results["matches_found"],
            }

        except Exception as e:
            # Update job record with error
            job.status = "FAILED"
            job.completed_at = datetime.utcnow()
            job.error_message = str(e)
            await session.commit()

            return {
                "job_id": job_id,
                "status": "failed",
                "error": str(e),
            }


async def screen_blacklist_on_whitelist_update(
    tenant_id: str,
    whitelist_entity_id: Optional[str] = None,
    job_id: Optional[str] = None,
) -> dict[str, Any]:
    """
    Screen new/updated whitelist customer against all blacklists.

    This is a background job that should be enqueued when a whitelist customer is added/updated.

    Args:
        tenant_id: Tenant ID
        whitelist_entity_id: Optional specific whitelist entity ID
        job_id: Optional job ID (will be created if not provided)

    Returns:
        Dictionary with job results
    """
    import os

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is required")
    database = create_database(database_url)

    async with database.async_session_maker() as session:
        # Create or update job record
        job: ScreeningJob
        if job_id:
            query_result = await session.execute(
                select(ScreeningJob).where(ScreeningJob.job_id == job_id)
            )
            existing_job = query_result.scalar_one_or_none()
            if existing_job is None:
                raise RuntimeError(f"Job {job_id} not found")
            job = existing_job
        else:
            job_id = str(uuid.uuid4())
            job = ScreeningJob(
                job_id=job_id,
                tenant_id=tenant_id,
                job_type="BLACKLIST_SCAN",
                trigger_type="LIST_UPDATE",
                status="RUNNING",
                started_at=datetime.utcnow(),
            )
            session.add(job)
            await session.commit()

        try:
            # Initialize screening service
            screening_service = BidirectionalScreeningService(session=session)

            # If specific entity provided, screen just that one
            if whitelist_entity_id:
                from aml_filter.db.models import Entity as DBEntity

                entity_result = await session.execute(
                    select(DBEntity).where(DBEntity.entity_id == whitelist_entity_id)
                )
                entity = entity_result.scalar_one_or_none()

                if entity:
                    matches = await screening_service.screen_entity_against_list(
                        entity=entity,
                        target_risk_category="SANCTION",
                        threshold=0.65,
                        match_type="WHITELIST_VS_BLACKLIST",
                        tenant_id=tenant_id,
                    )
                    matches_found = len(matches)
                    entities_scanned = 1
                else:
                    matches_found = 0
                    entities_scanned = 0
            else:
                # Screen all blacklists against this tenant's whitelist
                results = await screening_service.screen_whitelist_against_blacklist(
                    tenant_id=tenant_id,
                    threshold=0.65,
                    batch_size=100,
                )
                matches_found = results["matches_found"]
                entities_scanned = results["entities_scanned"]

            # Update job record
            job.status = "COMPLETED"
            job.completed_at = datetime.utcnow()
            job.entities_scanned = entities_scanned
            job.matches_found = matches_found
            await session.commit()

            return {
                "job_id": job_id,
                "status": "completed",
                "entities_scanned": entities_scanned,
                "matches_found": matches_found,
            }

        except Exception as e:
            # Update job record with error
            job.status = "FAILED"
            job.completed_at = datetime.utcnow()
            job.error_message = str(e)
            await session.commit()

            return {
                "job_id": job_id,
                "status": "failed",
                "error": str(e),
            }


async def run_bidirectional_screening(
    tenant_id: Optional[str] = None,
    job_id: Optional[str] = None,
) -> dict[str, Any]:
    """
    Run full bidirectional screening for all tenants or a specific tenant.

    Args:
        tenant_id: Optional tenant ID (screens all tenants if None)
        job_id: Optional job ID (will be created if not provided)

    Returns:
        Dictionary with job results
    """
    import os

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL environment variable is required")
    database = create_database(database_url)

    async with database.async_session_maker() as session:
        # Create or update job record
        job: ScreeningJob
        if job_id:
            query_result = await session.execute(
                select(ScreeningJob).where(ScreeningJob.job_id == job_id)
            )
            existing_job = query_result.scalar_one_or_none()
            if existing_job is None:
                raise RuntimeError(f"Job {job_id} not found")
            job = existing_job
        else:
            job_id = str(uuid.uuid4())
            job = ScreeningJob(
                job_id=job_id,
                tenant_id=tenant_id,
                job_type="BIDIRECTIONAL",
                trigger_type="MANUAL",
                status="RUNNING",
                started_at=datetime.utcnow(),
            )
            session.add(job)
            await session.commit()

        try:
            screening_service = BidirectionalScreeningService(session=session)

            if tenant_id:
                # Screen for specific tenant
                results = await screening_service.screen_whitelist_against_blacklist(
                    tenant_id=tenant_id,
                    threshold=0.65,
                    batch_size=100,
                )
                total_entities_scanned = results["entities_scanned"]
                total_matches_found = results["matches_found"]
            else:
                # Screen for all tenants
                tenants_result = await session.execute(select(Tenant))
                tenants = list(tenants_result.scalars().all())

                total_entities_scanned = 0
                total_matches_found = 0

                for tenant in tenants:
                    results = await screening_service.screen_whitelist_against_blacklist(
                        tenant_id=tenant.tenant_id,
                        threshold=0.65,
                        batch_size=100,
                    )
                    total_entities_scanned += results["entities_scanned"]
                    total_matches_found += results["matches_found"]

            # Update job record
            job.status = "COMPLETED"
            job.completed_at = datetime.utcnow()
            job.entities_scanned = total_entities_scanned
            job.matches_found = total_matches_found
            await session.commit()

            return {
                "job_id": job_id,
                "status": "completed",
                "entities_scanned": total_entities_scanned,
                "matches_found": total_matches_found,
            }

        except Exception as e:
            # Update job record with error
            job.status = "FAILED"
            job.completed_at = datetime.utcnow()
            job.error_message = str(e)
            await session.commit()

            return {
                "job_id": job_id,
                "status": "failed",
                "error": str(e),
            }

