"""Batch processing API endpoints."""

import asyncio
import csv
from io import StringIO

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.api.dependencies import get_db_session
from aml_filter.batch.parser import BatchParser
from aml_filter.batch.service import BatchService
from aml_filter.db.models import BatchJob
from aml_filter.search.service import SearchService
from aml_filter.security.middleware import require_api_key

# Tracks background batch jobs so the event loop doesn't garbage-collect them mid-flight.
# Done callback discards each task once complete.
_BACKGROUND_TASKS: set[asyncio.Task[None]] = set()

router = APIRouter(prefix="/batch", tags=["batch"])


class BatchJobResponse(BaseModel):
    """Response model for batch job."""

    model_config = ConfigDict(from_attributes=True)

    job_id: str
    tenant_id: str
    job_name: str | None
    status: str
    total_records: int
    processed_records: int
    matches_found: int
    created_at: str
    started_at: str | None
    completed_at: str | None
    error_message: str | None


@router.post("", response_model=BatchJobResponse, status_code=status.HTTP_201_CREATED)
async def create_batch_job(
    request: Request,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> BatchJobResponse:
    """Create a new batch screening job from uploaded file."""
    # Determine file format
    file_format = "csv"
    if file.filename:
        if file.filename.endswith(".json"):
            file_format = "json"
        elif file.filename.endswith(".csv"):
            file_format = "csv"

    # Read file content
    content = await file.read()
    content_str = content.decode("utf-8")

    # Parse queries
    try:
        parser = BatchParser()
        queries = parser.parse(content_str, format=file_format)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse file: {e!s}",
        ) from e

    if not queries:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid queries found in file",
        )

    # Create batch service
    search_service = SearchService(session=session)
    batch_service = BatchService(session=session, search_service=search_service)

    # Create job
    job = await batch_service.create_job(
        tenant_id=tenant_id,
        queries=queries,
        job_name=file.filename,
    )

    # Queue job for processing
    # In production, use a task queue like RQ or Celery
    # For now, we use a separate session for the background task.
    db = getattr(request.app.state, "db", None)

    async def run_batch_job(job_id: str) -> None:
        if db is None:
            return
        async with db.async_session_maker() as bg_session:
            bg_search = SearchService(session=bg_session)
            bg_batch = BatchService(session=bg_session, search_service=bg_search)
            await bg_batch.process_job(job_id)

    task = asyncio.create_task(run_batch_job(job.job_id))
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)

    return BatchJobResponse(
        job_id=job.job_id,
        tenant_id=job.tenant_id,
        job_name=job.job_name,
        status=job.status,
        total_records=job.total_records,
        processed_records=job.processed_records,
        matches_found=job.matches_found,
        created_at=job.created_at.isoformat(),
        started_at=job.started_at.isoformat() if job.started_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        error_message=job.error_message,
    )


@router.get("/{job_id}", response_model=BatchJobResponse)
async def get_batch_job(
    job_id: str,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> BatchJobResponse:
    """Get batch job status."""
    result = await session.execute(
        select(BatchJob).where(BatchJob.job_id == job_id, BatchJob.tenant_id == tenant_id)
    )
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found",
        )

    return BatchJobResponse(
        job_id=job.job_id,
        tenant_id=job.tenant_id,
        job_name=job.job_name,
        status=job.status,
        total_records=job.total_records,
        processed_records=job.processed_records,
        matches_found=job.matches_found,
        created_at=job.created_at.isoformat(),
        started_at=job.started_at.isoformat() if job.started_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        error_message=job.error_message,
    )


@router.get("", response_model=list[BatchJobResponse])
async def list_batch_jobs(
    status: str | None = None,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> list[BatchJobResponse]:
    """List batch jobs for the tenant."""
    batch_service = BatchService(session=session, search_service=SearchService(session=session))
    jobs = await batch_service.list_jobs(tenant_id=tenant_id, status=status)

    return [
        BatchJobResponse(
            job_id=job.job_id,
            tenant_id=job.tenant_id,
            job_name=job.job_name,
            status=job.status,
            total_records=job.total_records,
            processed_records=job.processed_records,
            matches_found=job.matches_found,
            created_at=job.created_at.isoformat(),
            started_at=job.started_at.isoformat() if job.started_at else None,
            completed_at=job.completed_at.isoformat() if job.completed_at else None,
            error_message=job.error_message,
        )
        for job in jobs
    ]


@router.get("/{job_id}/results")
async def get_batch_results(
    job_id: str,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> StreamingResponse:
    """Download batch job results as CSV."""
    result = await session.execute(
        select(BatchJob).where(BatchJob.job_id == job_id, BatchJob.tenant_id == tenant_id)
    )
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found",
        )

    if job.status != "COMPLETED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job {job_id} is not completed",
        )

    # Generate CSV
    results = job.metadata_json.get("results", [])
    output = StringIO()
    writer = csv.writer(output)

    # Write header
    writer.writerow(
        [
            "Request ID",
            "Entity ID",
            "Score",
            "Risk Category",
            "Source List",
            "Primary Name",
        ]
    )

    # Write results
    for result_item in results:
        for match in result_item.get("matches", []):
            writer.writerow(
                [
                    result_item.get("request_id", ""),
                    match.get("entity_id", ""),
                    match.get("score", ""),
                    match.get("risk_category", ""),
                    match.get("source_list", ""),
                    match.get("primary_name", ""),
                ]
            )

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="batch-{job_id}-results.csv"'},
    )
