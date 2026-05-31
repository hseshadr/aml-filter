"""Application settings — single source for env-driven configuration."""

import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

#: Default location of the persisted edge-proc localvec FAISS index. A relative
#: ``.vector_index`` dir means a fresh checkout retrieves end-to-end with zero config.
DEFAULT_VECTOR_INDEX_DIR = Path(".vector_index")


def vector_index_dir() -> Path:
    """Resolve the localvec index directory from ``VECTOR_INDEX_DIR`` (env-driven).

    Standalone from the full ``Settings`` load so building/loading the vector backend
    never forces a ``DATABASE_URL`` — the backend is usable without a database.
    """
    return Path(os.environ.get("VECTOR_INDEX_DIR", DEFAULT_VECTOR_INDEX_DIR))


def _find_env_file() -> str | None:
    """Walk up from this file to find the first `.env` (mirrors python-dotenv)."""
    for parent in Path(__file__).resolve().parents:
        candidate = parent / ".env"
        if candidate.is_file():
            return str(candidate)
    return None


class Settings(BaseSettings):
    """Process-wide settings loaded from environment or `.env`."""

    model_config = SettingsConfigDict(
        env_file=_find_env_file(),
        env_file_encoding="utf-8",
        extra="ignore",
        frozen=True,
    )

    database_url: str  # required, no default — fail closed if DATABASE_URL is unset
    redis_url: str = "redis://localhost:6379/0"  # intentional non-secret localhost dev default
    screening_queue_name: str = "screening"

    #: Directory where the edge-proc localvec FAISS index is persisted (built at ingest,
    #: loaded at query/startup). Env-driven via ``VECTOR_INDEX_DIR``; defaults to a local
    #: ``.vector_index`` dir so a fresh checkout retrieves end-to-end with zero config.
    vector_index_dir: Path = Path(".vector_index")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached process-wide Settings."""
    # database_url is populated from the environment, which mypy cannot see.
    return Settings()  # type: ignore[call-arg]
