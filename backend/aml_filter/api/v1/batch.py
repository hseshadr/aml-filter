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
from aml_filter.batch.models import BatchResultRow, load_results
from aml_filter.batch.parser import BatchParser
from aml_filter.batch.service import BatchService
from aml_filter.db.models import BatchJob
from aml_filter.domain.search import SearchQuery
from aml_filter.search.service import SearchService
from aml_filter.security.middleware import require_api_key

# Tracks background batch jobs so the event loop doesn't garbage-collect them mid-flight.
# Done callback discards each task once complete.
_BACKGROUND_TASKS: set[asyncio.Task[None]] = set()

router = APIRouter(prefix="/batch", tags=["batch"])


def _result_rows(result_item: BatchResultRow) -> list[list[str | float]]:
    """Flatten one query's matches into CSV rows."""
    return [
        [
            result_item.request_id,
            match.entity_id,
            match.score,
            match.risk_category,
            match.source_list,
            match.primary_name,
        ]
        for match in result_item.matches
    ]


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


def _detect_upload_format(filename: str | None) -> str:
    """Infer batch upload format from the filename, defaulting to csv."""
    if filename and filename.endswith(".json"):
        return "json"
    return "csv"


def _parse_upload(content_str: str, file_format: str) -> list[SearchQuery]:
    """Parse uploaded content into queries; raise 400 on parse failure or empty result."""
    try:
        queries = BatchParser().parse(content_str, format=file_format)
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
    return queries


def _schedule_batch_job(request: Request, job_id: str) -> None:
    """Run the batch job in the background on its own DB session, GC-safe."""
    db = getattr(request.app.state, "db", None)

    async def run_batch_job() -> None:
        if db is None:
            return
        async with db.async_session_maker() as bg_session:
            bg_search = SearchService(session=bg_session)
            bg_batch = BatchService(session=bg_session, search_service=bg_search)
            await bg_batch.process_job(job_id)

    task = asyncio.create_task(run_batch_job())
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)


def _job_to_response(job: BatchJob) -> BatchJobResponse:
    """Map a BatchJob ORM row to its API response model."""
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


@router.post("", response_model=BatchJobResponse, status_code=status.HTTP_201_CREATED)
async def create_batch_job(
    request: Request,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> BatchJobResponse:
    """Create a new batch screening job from uploaded file."""
    content = await file.read()
    queries = _parse_upload(content.decode("utf-8"), _detect_upload_format(file.filename))

    search_service = SearchService(session=session)
    batch_service = BatchService(session=session, search_service=search_service)
    job = await batch_service.create_job(
        tenant_id=tenant_id, queries=queries, job_name=file.filename
    )
    _schedule_batch_job(request, job.job_id)
    return _job_to_response(job)


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

    return _job_to_response(job)


@router.get("", response_model=list[BatchJobResponse])
async def list_batch_jobs(
    status: str | None = None,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_api_key),
) -> list[BatchJobResponse]:
    """List batch jobs for the tenant."""
    batch_service = BatchService(session=session, search_service=SearchService(session=session))
    jobs = await batch_service.list_jobs(tenant_id=tenant_id, status=status)

    return [_job_to_response(job) for job in jobs]


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

    # Generate CSV from the typed, validated results payload.
    results = load_results(job.metadata_json.get("results", []))
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["Request ID", "Entity ID", "Score", "Risk Category", "Source List", "Primary Name"]
    )
    for result_item in results:
        writer.writerows(_result_rows(result_item))
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="batch-{job_id}-results.csv"'},
    )
