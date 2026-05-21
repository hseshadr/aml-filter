"""FastAPI dependencies."""

from collections.abc import AsyncGenerator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession


async def get_db_session(request: Request) -> AsyncGenerator[AsyncSession]:
    """Yield an `AsyncSession` from `request.app.state.db` (wired in lifespan)."""
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise RuntimeError(
            "Database not initialized; set `app.state.db` at startup (see lifespan)."
        )
    async with db.async_session_maker() as session:
        yield session
