"""Verdicts for the live smoke that runs against the deployed site.

Green gates once shipped a weeks-stale UK list and, next door, an app that broke
for returning visitors. The live smoke drives the real site in a real browser;
this module turns its exit code and output into either evidence lines or one loud,
typed failure that names the production deployment to roll back.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

SMOKE_LISTS: Final = "OFAC_SDN,EU_CONSOLIDATED,UN_CONSOLIDATED,UK_OFSI"
MAX_FAILURE_LINES: Final = 80
PRIME_FAILURE_LINES: Final = 20
EVIDENCE_MARKERS: Final = ("[live-smoke", "published origin is FRESH")


class LiveSmokeFailedError(RuntimeError):
    """The deployed site failed the live smoke; production needs a rollback."""


@dataclass(frozen=True)
class SmokeRun:
    """Exit code and combined output of one smoke execution."""

    exit_code: int
    output: str


def smoke_passes(*, returning: bool) -> str:
    """Return the Playwright --grep for the passes this run must prove."""
    return "@fresh|@returning" if returning else "@fresh"


def _tail(output: str, lines: int) -> str:
    return "\n".join(output.splitlines()[-lines:])


def smoke_verdict(run: SmokeRun, deployment_id: str, deployment_url: str) -> str:
    """Return evidence lines for a green smoke; raise loudly for a red one."""
    if run.exit_code != 0:
        raise LiveSmokeFailedError(
            f"post-deploy live smoke FAILED (exit {run.exit_code}) on production "
            f"deployment {deployment_id} ({deployment_url}). Production is serving a "
            "release that failed in a real browser: roll back to the previous "
            "production deployment in Cloudflare Pages now.\n"
            f"{_tail(run.output, MAX_FAILURE_LINES)}"
        )
    evidence = [
        line
        for line in run.output.splitlines()
        if any(marker in line for marker in EVIDENCE_MARKERS)
    ]
    return "\n".join([f"live smoke PASSED on deployment {deployment_id}", *evidence])


def prime_note(run: SmokeRun) -> str:
    """Describe the returning-visitor profile; a failed prime is loud, not fatal.

    Priming runs against the release live BEFORE this deploy. If that release was
    already broken, blocking the deploy would block the fix, so the returning pass
    still runs, on an unprimed profile, and this says so.
    """
    if run.exit_code == 0:
        return "returning-visitor profile primed on the previous release"
    return (
        f"WARNING: returning-visitor profile NOT primed (exit {run.exit_code}); "
        "the previous release failed its own smoke:\n"
        f"{_tail(run.output, PRIME_FAILURE_LINES)}"
    )
