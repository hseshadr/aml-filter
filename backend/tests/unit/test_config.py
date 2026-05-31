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


def test_bundle_settings_default_none_and_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    """Bundle base-url/verify-key default to None (DB path); env switches to bundle mode."""
    from pathlib import Path

    default = Settings(
        _env_file=None,  # type: ignore[call-arg]
        database_url="postgresql+asyncpg://u:p@localhost:5432/db",
    )
    assert default.bundle_base_url is None
    assert default.verify_key_path is None

    monkeypatch.setenv("BUNDLE_BASE_URL", "https://cdn.example.com/ofac")
    monkeypatch.setenv("VERIFY_KEY_PATH", "/keys/trust.pub")
    monkeypatch.setenv("BUNDLE_CACHE_DIR", "/data/ofac_bundle")
    overridden = Settings(
        _env_file=None,  # type: ignore[call-arg]
        database_url="postgresql+asyncpg://u:p@localhost:5432/db",
    )
    assert overridden.bundle_base_url == "https://cdn.example.com/ofac"
    assert overridden.verify_key_path == Path("/keys/trust.pub")
    assert overridden.bundle_cache_dir == Path("/data/ofac_bundle")


def test_bundle_mode_active_requires_both_url_and_key() -> None:
    """bundle_mode_active is True only when both base-url and verify-key are set."""
    base = Settings(
        _env_file=None,  # type: ignore[call-arg]
        database_url="postgresql+asyncpg://u:p@localhost:5432/db",
    )
    assert base.bundle_mode_active() is False
    active = Settings(
        _env_file=None,  # type: ignore[call-arg]
        database_url="postgresql+asyncpg://u:p@localhost:5432/db",
        bundle_base_url="https://cdn/ofac",
        verify_key_path="/keys/trust.pub",
    )
    assert active.bundle_mode_active() is True
