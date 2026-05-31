"""Unit tests for fail-closed application settings."""

import pytest
from pydantic import ValidationError

from aml_filter.config import Settings


def test_missing_database_url_raises() -> None:
    """A missing DATABASE_URL must fail closed at settings-load time."""
    with pytest.raises(ValidationError, match="database_url"):
        Settings(_env_file=None)  # type: ignore[call-arg]


def test_present_database_url_loads() -> None:
    """A present DATABASE_URL loads cleanly."""
    settings = Settings(
        _env_file=None,  # type: ignore[call-arg]
        database_url="postgresql+asyncpg://u:p@localhost:5432/db",
    )
    assert settings.database_url == "postgresql+asyncpg://u:p@localhost:5432/db"


def test_redis_url_has_localhost_default() -> None:
    """redis_url keeps a non-secret localhost dev default (not a masked secret)."""
    settings = Settings(
        _env_file=None,  # type: ignore[call-arg]
        database_url="postgresql+asyncpg://u:p@localhost:5432/db",
    )
    assert settings.redis_url == "redis://localhost:6379/0"


def test_vector_index_dir_default_and_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    """vector_index_dir has a sensible default and is overridable from the environment."""
    from pathlib import Path

    default = Settings(
        _env_file=None,  # type: ignore[call-arg]
        database_url="postgresql+asyncpg://u:p@localhost:5432/db",
    )
    assert default.vector_index_dir == Path(".vector_index")

    monkeypatch.setenv("VECTOR_INDEX_DIR", "/data/aml_index")
    overridden = Settings(
        _env_file=None,  # type: ignore[call-arg]
        database_url="postgresql+asyncpg://u:p@localhost:5432/db",
    )
    assert overridden.vector_index_dir == Path("/data/aml_index")
