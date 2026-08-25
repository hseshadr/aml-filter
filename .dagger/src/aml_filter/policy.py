"""Small, typed release policies shared by Dagger entrypoints."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from enum import StrEnum
from typing import Final

APEX_ORIGIN: Final = "https://aml-filter.com"
FALLBACK_DAYS: Final = 7
SAFE_VERSION: Final = re.compile(r"^[A-Za-z0-9._-]+$")
SOURCE_SHA: Final = re.compile(r"^[0-9a-f]{40}$")
RUN_ID: Final = re.compile(r"^[0-9]+$")


class InvalidReleaseIdentityError(ValueError):
    """Raised when untrusted release metadata violates the public contract."""


class ReleaseKind(StrEnum):
    """The two publication paths with intentionally different fallbacks."""

    CODE = "code"
    WATCHLIST = "watchlist"


@dataclass(frozen=True)
class ReleaseIdentity:
    """Exact source and hosted-run identity stamped into the application."""

    source_sha: str
    run_id: str


def whole_bundle_fallback_days(kind: ReleaseKind) -> int:
    """Return the code-deploy fallback bound; nightly refreshes must fail."""
    if kind is ReleaseKind.WATCHLIST:
        raise InvalidReleaseIdentityError("watchlist publish forbids whole-bundle fallback")
    return FALLBACK_DAYS


def release_version(stamp: str, today: date) -> str:
    """Validate a caller stamp or use the UTC run date."""
    version = stamp or today.isoformat()
    if SAFE_VERSION.fullmatch(version) is None:
        raise InvalidReleaseIdentityError("version contains unsafe characters")
    return version


def release_identity(source_sha: str, run_id: str) -> ReleaseIdentity:
    """Validate exact immutable source and hosted-run identifiers."""
    if SOURCE_SHA.fullmatch(source_sha) is None:
        raise InvalidReleaseIdentityError("source SHA must be 40 lowercase hex characters")
    if RUN_ID.fullmatch(run_id) is None:
        raise InvalidReleaseIdentityError("run id must be numeric")
    return ReleaseIdentity(source_sha, run_id)


def parse_release_identity(stamp: str) -> ReleaseIdentity:
    """Parse the ingress-safe ``<source-sha>:<run-id>`` identity."""
    source_sha, separator, run_id = stamp.partition(":")
    if separator == "":
        raise InvalidReleaseIdentityError("release identity must separate SHA and run id")
    return release_identity(source_sha, run_id)


def canonical_redirect(path_and_query: str) -> str:
    """Return the exact apex target expected from the www redirect."""
    if not path_and_query.startswith("/"):
        raise InvalidReleaseIdentityError("canonical path must start with slash")
    return f"{APEX_ORIGIN}{path_and_query}"
