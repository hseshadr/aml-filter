from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import aml_filter.db.session as session_mod


@pytest.mark.asyncio
async def test_database_create_and_drop_tables_calls_run_sync() -> None:
    # Patch create_async_engine to avoid touching real engine internals.
    fake_conn = AsyncMock()

    class _CM:
        async def __aenter__(self):
            return fake_conn

        async def __aexit__(self, exc_type, exc, tb):
            return False

    fake_engine = MagicMock()
    fake_engine.begin.return_value = _CM()

    with patch.object(session_mod, "create_async_engine", return_value=fake_engine):
        db = session_mod.Database("postgresql+asyncpg://user:pass@localhost:5432/db")
        await db.create_tables()
        fake_conn.run_sync.assert_awaited()

        fake_conn.run_sync.reset_mock()
        await db.drop_tables()
        fake_conn.run_sync.assert_awaited()


@pytest.mark.asyncio
async def test_database_close_disposes_engine() -> None:
    fake_engine = MagicMock()
    fake_engine.dispose = AsyncMock()

    with patch.object(session_mod, "create_async_engine", return_value=fake_engine):
        db = session_mod.Database("postgresql+asyncpg://user:pass@localhost:5432/db")
        await db.close()
        fake_engine.dispose.assert_awaited_once()
