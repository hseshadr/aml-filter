"""Auto-downloader for configured sanctions lists.

Given the enabled lists' ``source_url``s, fetch each over HTTP, parse it with the
registered parser, and ingest it through :meth:`IngestionService.ingest_list` (which
creates a ``ListVersion`` and enqueues the whitelist rescan). The download loop is
**fail-soft per list** — one list failing to fetch or parse does not abort the others —
but **fail-closed on a bad payload**: a payload the parser rejects is reported as a
failure for that list rather than ingested partially.

HTTP and ingest are injected (``fetch`` / ``ingest_list``) so the loop is unit-testable
without live network or a database. :func:`httpx_fetch` is the production fetcher and
:func:`refresh_enabled_lists` is the DB-backed entry point used by the RQ job.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Final

import httpx
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aml_filter.db.models import ListVersion, TenantListConfig
from aml_filter.ingest.service import IngestionService

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT_S: Final[float] = 60.0

#: Fetch a URL and return its raw bytes.
Fetcher = Callable[[str], Awaitable[bytes]]
#: Ingest a parsed list: (list_id, raw, version) -> stats.
ListIngester = Callable[[str, bytes, str | None], Awaitable[dict[str, str | int]]]


class ListSource(BaseModel):
    """A list to refresh: its id and the URL its payload is published at."""

    model_config = ConfigDict(frozen=True)

    list_id: str = Field(..., min_length=1)
    source_url: str = Field(..., min_length=1)


class RefreshOutcome(BaseModel):
    """Per-list result of a refresh pass."""

    model_config = ConfigDict(frozen=True)

    list_id: str
    ok: bool
    error: str | None = None


async def httpx_fetch(url: str) -> bytes:
    """Fetch ``url`` over HTTP and return its bytes (raises on non-2xx)."""
    async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT_S, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.content


class ListSyncDownloader:
    """Fetch, parse and ingest configured sanctions lists, fail-soft per list."""

    def __init__(self, fetch: Fetcher, ingest_list: ListIngester) -> None:
        self._fetch = fetch
        self._ingest_list = ingest_list

    async def refresh(self, sources: list[ListSource]) -> list[RefreshOutcome]:
        """Refresh every source, returning one outcome per source."""
        return [await self._refresh_one(source) for source in sources]

    async def _refresh_one(self, source: ListSource) -> RefreshOutcome:
        """Fetch + ingest a single source, capturing any failure as an outcome."""
        try:
            payload = await self._fetch(source.source_url)
            await self._ingest_list(source.list_id, payload, None)
        except Exception as exc:  # noqa: BLE001 — fail-soft: one bad list must not abort the rest
            logger.warning("Refresh failed for list %s: %s", source.list_id, exc)
            return RefreshOutcome(list_id=source.list_id, ok=False, error=str(exc))
        return RefreshOutcome(list_id=source.list_id, ok=True)


async def _enabled_list_sources(session: AsyncSession) -> list[ListSource]:
    """Collect distinct enabled list ids paired with their latest active source URL."""
    enabled = await session.execute(
        select(TenantListConfig.list_id).where(TenantListConfig.enabled.is_(True)).distinct()
    )
    sources = [await _source_for(session, list_id) for (list_id,) in enabled.all()]
    return [source for source in sources if source is not None]


async def _source_for(session: AsyncSession, list_id: str) -> ListSource | None:
    """Find the most recent ``source_url`` recorded for ``list_id``."""
    result = await session.execute(
        select(ListVersion.source_url)
        .where(ListVersion.list_id == list_id, ListVersion.source_url.is_not(None))
        .order_by(ListVersion.ingested_at.desc())
        .limit(1)
    )
    url = result.scalar_one_or_none()
    return ListSource(list_id=list_id, source_url=url) if url else None


async def refresh_enabled_lists(session: AsyncSession) -> list[RefreshOutcome]:
    """DB-backed entry point: refresh every enabled list with a known source URL."""
    service = IngestionService(session=session)
    downloader = ListSyncDownloader(fetch=httpx_fetch, ingest_list=service.ingest_list)
    sources = await _enabled_list_sources(session)
    return await downloader.refresh(sources)
