"""Config-gated entry to the bundle-backed (no-Postgres) screening read-path.

Mirrors edge-reco's ``serve`` branch: when ``Settings.bundle_mode_active()`` is true
(``BUNDLE_BASE_URL`` + ``VERIFY_KEY_PATH`` set), screening sources OFAC candidates and
metadata from a synced, ed25519-verified bundle instead of Postgres. Otherwise the
caller keeps the existing DB-backed ``SearchService`` path.
"""

from __future__ import annotations

from aml_filter.bundle.screening import BundleScreeningSource
from aml_filter.bundle.sync import sync_bundle
from aml_filter.config import Settings


def load_bundle_screening_source(settings: Settings) -> BundleScreeningSource:
    """Sync + verify the configured bundle and wrap it in a screening source.

    Raises ``RuntimeError`` when bundle mode is not fully configured — callers must
    branch on ``settings.bundle_mode_active()`` before invoking (fail-closed, no
    silent fallback to an empty index).
    """
    if settings.bundle_base_url is None or settings.verify_key_path is None:
        raise RuntimeError("bundle mode requires BUNDLE_BASE_URL and VERIFY_KEY_PATH to be set")
    synced = sync_bundle(
        base_url=settings.bundle_base_url,
        verify_key_path=settings.verify_key_path,
        cache_root=settings.bundle_cache_dir,
    )
    return BundleScreeningSource(synced)
