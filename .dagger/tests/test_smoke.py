"""Contracts for the post-deploy live-smoke verdict."""

from __future__ import annotations

import pytest

from aml_filter.smoke import (
    MAX_FAILURE_LINES,
    SMOKE_LISTS,
    LiveSmokeFailedError,
    SmokeRun,
    prime_note,
    smoke_passes,
    smoke_verdict,
)

# The failure tail the operator reads is pinned to its literal, not to itself.
PINNED_FAILURE_LINES = 80
FRESH_LINE = "published origin is FRESH: version=2026-09-25 sequence=131, carry ceiling 7d"
SMOKE_LINE = "[live-smoke fresh] /screen OFAC_SDN: Maduro Moros Nicolas | UK_OFSI: Sechin"
PASSING_OUTPUT = "\n".join(
    (
        "Running 2 tests using 1 worker",
        FRESH_LINE,
        "UK_OFSI  uk  2026-09-25  5682  2026-09-25T10:53:20.109Z  fetchedAt  4.6h  no",
        SMOKE_LINE,
        "  2 passed (1.9m)",
    )
)


def test_should_pin_every_list_the_product_claims_to_screen() -> None:
    # Then: the literal the product promises, not a constant compared to itself.
    assert SMOKE_LISTS == "OFAC_SDN,EU_CONSOLIDATED,UN_CONSOLIDATED,UK_OFSI"


def test_should_run_returning_pass_only_after_a_deploy() -> None:
    # When / Then
    assert smoke_passes(returning=True) == "@fresh|@returning"
    assert smoke_passes(returning=False) == "@fresh"


def test_should_report_evidence_lines_when_smoke_passes() -> None:
    # When
    verdict = smoke_verdict(SmokeRun(0, PASSING_OUTPUT), "dep-1", "https://dep-1.pages.dev")

    # Then
    assert verdict.splitlines() == [
        "live smoke PASSED on deployment dep-1",
        FRESH_LINE,
        SMOKE_LINE,
    ]


def test_should_fail_loudly_naming_the_deployment_when_smoke_fails() -> None:
    # Given
    output = "Error: live /screen boot failed closed: signature verification failed"

    # When
    with pytest.raises(LiveSmokeFailedError) as raised:
        smoke_verdict(SmokeRun(1, output), "dep-2", "https://dep-2.pages.dev")

    # Then
    message = str(raised.value)
    assert "FAILED (exit 1)" in message
    assert "deployment dep-2 (https://dep-2.pages.dev)" in message
    assert "roll back" in message
    assert "signature verification failed" in message


def test_should_bound_failure_output_to_the_tail() -> None:
    # Given
    output = "\n".join(f"line {index}" for index in range(500))

    # When
    with pytest.raises(LiveSmokeFailedError) as raised:
        smoke_verdict(SmokeRun(1, output), "dep-3", "https://dep-3.pages.dev")

    # Then
    message = str(raised.value)
    assert MAX_FAILURE_LINES == PINNED_FAILURE_LINES
    assert "line 499" in message
    assert "line 420" in message
    assert "line 419" not in message


def test_should_say_the_returning_profile_was_primed() -> None:
    # When / Then
    assert prime_note(SmokeRun(0, "")) == "returning-visitor profile primed on the previous release"


def test_should_warn_loudly_when_priming_the_previous_release_failed() -> None:
    # When
    note = prime_note(SmokeRun(1, "x\nError: /settings refused: offline"))

    # Then
    assert note.startswith("WARNING: returning-visitor profile NOT primed (exit 1)")
    assert "Error: /settings refused: offline" in note
