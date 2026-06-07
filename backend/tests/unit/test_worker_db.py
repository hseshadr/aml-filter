"""Tests for the shared worker async-session opener."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aml_filter.worker import db


@pytest.mark.asyncio
async def test_should_yield_session_from_configured_database() -> None:
    # Given a configured database url and a fake Database
    settings = MagicMock()
    settings.database_url = "postgresql+asyncpg://u:p@localhost/db"
    session = AsyncMock()

    class _Maker:
        def __call__(self) -> _Maker:
            return self

        async def __aenter__(self) -> object:
            return session

        async def __aexit__(self, *_: object) -> None:
            return None

    database = MagicMock()
    database.async_session_maker = _Maker()

    with (
        patch.object(db, "get_settings", return_value=settings),
        patch.object(db, "create_database", return_value=database) as create,
    ):
        # When opening a worker session
        async with db.open_worker_session() as opened:
            pass

    # Then it built the database from the configured url and yielded its session
    create.assert_called_once_with(settings.database_url)
    assert opened is session


@pytest.mark.asyncio
async def test_should_fail_closed_without_database_url() -> None:
    # Given no database url configured
    settings = MagicMock()
    settings.database_url = ""

    with (
        patch.object(db, "get_settings", return_value=settings),
        pytest.raises(RuntimeError),
    ):
        # When opening a session, then it fails closed
        async with db.open_worker_session():
            pass
