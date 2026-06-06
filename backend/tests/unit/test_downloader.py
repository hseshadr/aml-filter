"""Unit tests for the sanctions-list auto-downloader."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from aml_filter.ingest.downloader import (
    ListSource,
    ListSyncDownloader,
    RefreshOutcome,
    _enabled_list_sources,
    _source_for,
    httpx_fetch,
    refresh_enabled_lists,
)


def _source(list_id: str) -> ListSource:
    return ListSource(list_id=list_id, source_url=f"https://example.test/{list_id}.xml")


@pytest.mark.asyncio
async def test_should_fetch_parse_and_ingest_each_enabled_list() -> None:
    # Given a fetcher returning bytes and a stubbed ingest service
    fetcher = AsyncMock(return_value=b"<payload/>")
    ingest = AsyncMock(return_value={"created": 3})
    downloader = ListSyncDownloader(fetch=fetcher, ingest_list=ingest)

    # When refreshing two enabled lists
    outcomes = await downloader.refresh([_source("OFAC_SDN"), _source("EU_CONSOLIDATED")])

    # Then each list was fetched and ingested
    assert fetcher.await_count == 2
    assert ingest.await_count == 2
    assert all(o.ok for o in outcomes)
    assert {o.list_id for o in outcomes} == {"OFAC_SDN", "EU_CONSOLIDATED"}


@pytest.mark.asyncio
async def test_should_continue_when_one_list_fails_to_fetch() -> None:
    # Given a fetcher that raises for one list
    async def fetch(url: str) -> bytes:
        if "OFAC" in url:
            raise ConnectionError("boom")
        return b"<payload/>"

    ingest = AsyncMock(return_value={"created": 1})
    downloader = ListSyncDownloader(fetch=fetch, ingest_list=ingest)

    # When refreshing both
    outcomes = await downloader.refresh([_source("OFAC_SDN"), _source("EU_CONSOLIDATED")])

    # Then the failing list is reported but the other still ingested (fail-soft per-list)
    by_id = {o.list_id: o for o in outcomes}
    assert by_id["OFAC_SDN"].ok is False
    assert by_id["OFAC_SDN"].error is not None
    assert by_id["EU_CONSOLIDATED"].ok is True
    assert ingest.await_count == 1


@pytest.mark.asyncio
async def test_should_mark_list_failed_when_ingest_rejects_bad_payload() -> None:
    # Given a fetcher that returns a payload the parser rejects
    fetcher = AsyncMock(return_value=b"not valid xml")
    ingest = AsyncMock(side_effect=ValueError("malformed"))
    downloader = ListSyncDownloader(fetch=fetcher, ingest_list=ingest)

    # When refreshing
    outcomes = await downloader.refresh([_source("EU_CONSOLIDATED")])

    # Then the bad payload is reported as a failure (fail-closed on payload)
    assert outcomes[0].ok is False
    assert outcomes[0].error is not None


def test_refresh_outcome_is_frozen() -> None:
    # Given an outcome
    outcome = RefreshOutcome(list_id="X", ok=True, error=None)
    # When mutating it
    # Then it raises (immutable result type)
    with pytest.raises(Exception):
        outcome.ok = False  # type: ignore[misc]


@pytest.mark.asyncio
async def test_httpx_fetch_returns_body_bytes() -> None:
    # Given a mock transport returning a 200 with a body
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"<list/>")

    transport = httpx.MockTransport(handler)

    # When fetching (patching AsyncClient to use the mock transport)
    real_client = httpx.AsyncClient
    with patch.object(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw)):
        body = await httpx_fetch("https://example.test/list.xml")

    # Then the response bytes are returned
    assert body == b"<list/>"


@pytest.mark.asyncio
async def test_httpx_fetch_raises_on_http_error() -> None:
    # Given a transport returning a 503
    transport = httpx.MockTransport(lambda _: httpx.Response(503))
    real_client = httpx.AsyncClient

    # When fetching
    # Then a status error is raised (fail-closed)
    with (
        patch.object(httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw)),
        pytest.raises(httpx.HTTPStatusError),
    ):
        await httpx_fetch("https://example.test/list.xml")


@pytest.mark.asyncio
async def test_source_for_returns_latest_recorded_url() -> None:
    # Given a list with a recorded source URL
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = "https://example.test/ofac.xml"
    session.execute.return_value = result

    # When resolving its source
    source = await _source_for(session, "OFAC_SDN")

    # Then a ListSource is returned
    assert source is not None
    assert source.source_url == "https://example.test/ofac.xml"


@pytest.mark.asyncio
async def test_source_for_returns_none_when_no_url() -> None:
    # Given a list with no recorded source URL
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    session.execute.return_value = result

    # When resolving its source
    source = await _source_for(session, "OFAC_SDN")

    # Then None is returned (skipped by the refresh)
    assert source is None


@pytest.mark.asyncio
async def test_enabled_list_sources_drops_lists_without_urls() -> None:
    # Given one enabled list with a URL and one without
    session = AsyncMock()
    enabled_result = MagicMock()
    enabled_result.all.return_value = [("OFAC_SDN",), ("EU_CONSOLIDATED",)]
    with_url = MagicMock()
    with_url.scalar_one_or_none.return_value = "https://example.test/ofac.xml"
    without_url = MagicMock()
    without_url.scalar_one_or_none.return_value = None
    session.execute.side_effect = [enabled_result, with_url, without_url]

    # When collecting sources
    sources = await _enabled_list_sources(session)

    # Then only the list with a URL is returned
    assert [s.list_id for s in sources] == ["OFAC_SDN"]


@pytest.mark.asyncio
async def test_refresh_enabled_lists_wires_db_sources_into_downloader() -> None:
    # Given enabled sources resolved from the DB
    session = AsyncMock()
    sources = [ListSource(list_id="OFAC_SDN", source_url="https://example.test/ofac.xml")]
    with (
        patch(
            "aml_filter.ingest.downloader._enabled_list_sources", AsyncMock(return_value=sources)
        ),
        patch("aml_filter.ingest.downloader.httpx_fetch", AsyncMock(return_value=b"<list/>")),
        patch("aml_filter.ingest.downloader.IngestionService") as service_cls,
    ):
        service_cls.return_value.ingest_list = AsyncMock(return_value={})
        # When refreshing
        outcomes = await refresh_enabled_lists(session)

    # Then the resolved source was refreshed successfully
    assert len(outcomes) == 1
    assert outcomes[0].ok is True
