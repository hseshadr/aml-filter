"""Unit tests for the list-refresh RQ job entry point."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aml_filter.ingest.downloader import RefreshOutcome
from aml_filter.worker import ingest_jobs


@pytest.mark.asyncio
async def test_should_refresh_enabled_lists_within_a_session() -> None:
    # Given a stubbed session context and refresh function
    fake_outcomes = [RefreshOutcome(list_id="OFAC_SDN", ok=True)]
    session = AsyncMock()

    class _Ctx:
        async def __aenter__(self) -> object:
            return session

        async def __aexit__(self, *_: object) -> None:
            return None

    with (
        patch.object(ingest_jobs, "_open_session", return_value=_Ctx()),
        patch.object(
            ingest_jobs, "refresh_enabled_lists", AsyncMock(return_value=fake_outcomes)
        ) as refresh,
    ):
        # When running the async refresh
        result = await ingest_jobs._refresh_all_lists()

    # Then it refreshed within the session and returned a summary count
    refresh.assert_awaited_once_with(session)
    assert result == {"refreshed": 1, "failed": 0}


def test_refresh_all_enabled_lists_is_callable_as_sync_job() -> None:
    # Given the sync RQ entry wraps the async refresh
    with patch.object(
        ingest_jobs, "_refresh_all_lists", AsyncMock(return_value={"refreshed": 0, "failed": 0})
    ):
        # When invoked synchronously (as RQ would)
        result = ingest_jobs.refresh_all_enabled_lists()
    # Then it returns the summary
    assert result == {"refreshed": 0, "failed": 0}


@pytest.mark.asyncio
async def test_open_session_yields_a_session_from_configured_database() -> None:
    # Given a configured database url and a fake Database
    settings = MagicMock()
    settings.database_url = "postgresql+asyncpg://u:p@localhost/db"
    session = AsyncMock()

    class _Maker:
        def __call__(self) -> "_Maker":
            return self

        async def __aenter__(self) -> object:
            return session

        async def __aexit__(self, *_: object) -> None:
            return None

    database = MagicMock()
    database.async_session_maker = _Maker()

    with (
        patch.object(ingest_jobs, "get_settings", return_value=settings),
        patch.object(ingest_jobs, "create_database", return_value=database) as create,
    ):
        # When opening a session
        async with ingest_jobs._open_session() as opened:
            pass

    # Then it built the database from the configured url and yielded its session
    create.assert_called_once_with(settings.database_url)
    assert opened is session


@pytest.mark.asyncio
async def test_open_session_fails_closed_without_database_url() -> None:
    # Given no database url configured
    settings = MagicMock()
    settings.database_url = ""

    with (
        patch.object(ingest_jobs, "get_settings", return_value=settings),
        pytest.raises(RuntimeError),
    ):
        # When opening a session, then it fails closed
        async with ingest_jobs._open_session():
            pass
