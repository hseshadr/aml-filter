"""Application settings — single source for env-driven configuration."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached process-wide Settings."""
    # database_url is populated from the environment, which mypy cannot see.
    return Settings()  # type: ignore[call-arg]
