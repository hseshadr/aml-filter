"""Behavioral contracts for release policy at the Dagger boundary."""

from __future__ import annotations

from datetime import date
from typing import Final

import pytest

from aml_filter.policy import (
    InvalidReleaseIdentityError,
    ReleaseKind,
    canonical_redirect,
    parse_release_identity,
    release_identity,
    release_version,
    whole_bundle_fallback_days,
)

EXPECTED_FALLBACK_DAYS: Final = 7


def test_should_bound_fallback_when_code_deploy() -> None:
    # Given
    kind = ReleaseKind.CODE

    # When
    days = whole_bundle_fallback_days(kind)

    # Then
    assert days == EXPECTED_FALLBACK_DAYS


def test_should_forbid_fallback_when_watchlist_publish() -> None:
    # Given
    kind = ReleaseKind.WATCHLIST

    # When / Then
    with pytest.raises(InvalidReleaseIdentityError, match="watchlist publish"):
        whole_bundle_fallback_days(kind)


def test_should_default_version_when_stamp_is_empty() -> None:
    # Given
    today = date(2026, 8, 25)

    # When
    version = release_version("", today)

    # Then
    assert version == "2026-08-25"


@pytest.mark.parametrize("stamp", ["bad stamp", "oops/branch", "$(unsafe)"])
def test_should_reject_version_when_stamp_is_unsafe(stamp: str) -> None:
    # Given
    today = date(2026, 8, 25)

    # When / Then
    with pytest.raises(InvalidReleaseIdentityError, match="version"):
        release_version(stamp, today)


def test_should_bind_identity_when_source_and_run_are_exact() -> None:
    # Given
    source_sha = "a" * 40

    # When
    identity = release_identity(source_sha, "123456")

    # Then
    assert identity.source_sha == source_sha
    assert identity.run_id == "123456"


@pytest.mark.parametrize("source_sha", ["abc", "A" * 40, "g" * 40])
def test_should_reject_identity_when_source_sha_is_not_exact(source_sha: str) -> None:
    # Given
    run_id = "123456"

    # When / Then
    with pytest.raises(InvalidReleaseIdentityError, match="source SHA"):
        release_identity(source_sha, run_id)


def test_should_parse_identity_when_ingress_binds_sha_and_run() -> None:
    # Given
    stamp = f"{'a' * 40}:123456"

    # When
    identity = parse_release_identity(stamp)

    # Then
    assert identity.source_sha == "a" * 40
    assert identity.run_id == "123456"


def test_should_preserve_path_and_query_when_redirecting_to_apex() -> None:
    # Given
    path_and_query = "/settings?source=deploy-check"

    # When
    target = canonical_redirect(path_and_query)

    # Then
    assert target == "https://aml-filter.com/settings?source=deploy-check"
