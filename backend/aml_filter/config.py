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

    #: Signed OFAC bundle origin (``BUNDLE_BASE_URL``): an ``http(s)://`` URL or a local
    #: path. When set together with ``verify_key_path``, screening reads OFAC candidates
    #: and metadata from a synced, ed25519-verified edge-proc bundle instead of Postgres.
    bundle_base_url: str | None = None
    #: Path to the pinned ed25519 public key (``VERIFY_KEY_PATH``) used to fail-closed
    #: verify a synced bundle. Required (with ``bundle_base_url``) for bundle-backed mode.
    verify_key_path: Path | None = None
    #: Local cache root for synced bundle objects (``BUNDLE_CACHE_DIR``).
    bundle_cache_dir: Path = Path(".ofac_bundle")

    #: Path to the raw ed25519 *private* key (``ATTESTATION_SIGNING_KEY_PATH``) used to
    #: sign screening attestations. When unset, attestations are persisted unsigned.
    #: The matching public half is the pinned trust root (``verify_key_path``), so a
    #: signed badge is verifiable with the same key that authenticates OFAC bundles.
    attestation_signing_key_path: Path | None = None
    #: Identifier recorded alongside a signed attestation (``ATTESTATION_SIGNING_KEY_ID``).
    attestation_signing_key_id: str = "default"
    #: How many days an attestation stays valid before a customer is "due for re-review"
    #: (``ATTESTATION_VALIDITY_DAYS``).
    attestation_validity_days: int = 90

    def bundle_mode_active(self) -> bool:
        """True when both bundle base-url and verify-key are set (bundle read-path)."""
        return self.bundle_base_url is not None and self.verify_key_path is not None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached process-wide Settings."""
    # database_url is populated from the environment, which mypy cannot see.
    return Settings()  # type: ignore[call-arg]
