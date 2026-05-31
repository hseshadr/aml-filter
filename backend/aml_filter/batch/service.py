"""Batch processing service."""

import asyncio
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.batch.models import dump_results, load_queries
from aml_filter.db.models import BatchJob
from aml_filter.domain.search import SearchQuery, SearchResponse
from aml_filter.search.service import SearchService


class BatchService:
    """Service for processing batch screening jobs."""

    def __init__(self, session: AsyncSession, search_service: SearchService):
        self.session = session
        self.search_service = search_service

    async def create_job(
        self,
        tenant_id: str,
        queries: list[SearchQuery],
        job_name: str | None = None,
    ) -> BatchJob:
        """Create a new batch job."""
        job_id = str(uuid4())
        job = BatchJob(
            job_id=job_id,
            tenant_id=tenant_id,
            job_name=job_name or f"Batch Job {job_id[:8]}",
            status="PENDING",
            total_records=len(queries),
            processed_records=0,
            matches_found=0,
        )
        self.session.add(job)
        await self.session.commit()
        await self.session.refresh(job)

        # Store queries in metadata for processing
        job.metadata_json = {"queries": [q.model_dump() for q in queries]}
        await self.session.commit()

        return job

    async def process_job(self, job_id: str, chunk_size: int = 10) -> None:
        """Process a batch job."""
        job = await self._load_processable_job(job_id)
        job.status = "RUNNING"
        await self.session.commit()

        queries = load_queries(job.metadata_json)
        try:
            results = await self._run_chunks(job, queries, chunk_size)
            job.metadata_json["results"] = dump_results(results)
            job.matches_found = sum(len(r.matches) for r in results)
            job.status = "COMPLETED"
        except Exception as exc:  # noqa: BLE001 — job boundary: must record FAILED status for any error
            job.status = "FAILED"
            job.error_message = str(exc)
            job.metadata_json["error"] = str(exc)
        await self.session.commit()

    async def _load_processable_job(self, job_id: str) -> BatchJob:
        """Load the job and assert it is in a processable (PENDING/RUNNING) state."""
        result = await self.session.execute(select(BatchJob).where(BatchJob.job_id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            raise ValueError(f"Job {job_id} not found")
        if job.status not in ["PENDING", "RUNNING"]:
            raise ValueError(f"Job {job_id} is not in a processable state")
        return job

    async def _run_chunks(
        self, job: BatchJob, queries: list[SearchQuery], chunk_size: int
    ) -> list[SearchResponse]:
        """Screen queries in chunks, committing progress, and return all responses."""
        results: list[SearchResponse] = []
        for i in range(0, len(queries), chunk_size):
            chunk = queries[i : i + chunk_size]
            chunk_results = await asyncio.gather(
                *[self.search_service.search(query=q, tenant_id=job.tenant_id) for q in chunk]
            )
            results.extend(chunk_results)
            job.processed_records = min(i + chunk_size, len(queries))
            job.matches_found = sum(len(r.matches) for r in results)
            await self.session.commit()
        return results

    async def get_job(self, job_id: str, tenant_id: str) -> BatchJob | None:
        """Get a batch job."""
        result = await self.session.execute(
            select(BatchJob).where(BatchJob.job_id == job_id, BatchJob.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_jobs(self, tenant_id: str, status: str | None = None) -> list[BatchJob]:
        """List batch jobs for a tenant."""
        stmt = select(BatchJob).where(BatchJob.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(BatchJob.status == status)
        stmt = stmt.order_by(BatchJob.created_at.desc())

        result = await self.session.execute(stmt)
        return list(result.scalars().all())
