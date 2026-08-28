"""Executable schema contracts for the public Dagger module."""

from __future__ import annotations

import json
import subprocess
from collections.abc import Awaitable
from dataclasses import dataclass
from pathlib import Path
from shutil import which
from typing import Final, cast

import pytest
from dagger import Container, Directory

import aml_filter.main as main_module
from aml_filter.main import FRESHNESS_CHECK, REPOSITORY, REPOSITORY_URL, AmlFilter

ROOT: Final = Path(__file__).resolve().parents[2]
CENTRAL_SHA: Final = "daebff7ebf3e69a0361b90cd7b7a767c0e4b48e1"
FOUNDATION_MODULE: Final = f"github.com/hseshadr/ci/modules/portfolio-foundation@{CENTRAL_SHA}"
RECORDED_SHA: Final = "0123456789abcdef0123456789abcdef01234567"
MALFORMED_SHA: Final = "not-a-sha"
EXPECTED_GUARD_EVENTS: Final = (
    f"git:{REPOSITORY_URL}",
    "branch:main",
    "resolve-commit",
    f"git:{REPOSITORY_URL}",
    f"commit:{RECORDED_SHA}",
    "tree:0",
    "foundation",
)
MALFORMED_GUARD_CALL: Final = (
    "-m",
    FOUNDATION_MODULE,
    "call",
    "guard",
    "--source=.",
    f"--repository={REPOSITORY}",
    f"--commit-sha={MALFORMED_SHA}",
    "sync",
)


@dataclass(frozen=True)
class GuardCall:
    """One recorded generated-Foundation boundary invocation."""

    source: Directory
    repository: str
    commit_sha: str


class RecordingFoundation:
    """Record the exact guard call while preserving its returned object."""

    def __init__(self, result: Container) -> None:
        self.result = result
        self.call: GuardCall | None = None

    def guard(self, source: Directory, repository: str, commit_sha: str) -> Container:
        self.call = GuardCall(source, repository, commit_sha)
        return self.result


class RecordingGitRef:
    """Resolve one exact commit and source tree without network access."""

    def __init__(self, source: Directory, events: list[str]) -> None:
        self.source = source
        self.events = events

    async def commit(self) -> str:
        self.events.append("resolve-commit")
        return RECORDED_SHA

    def tree(self, *, depth: int) -> Directory:
        self.events.append(f"tree:{depth}")
        return self.source


class RecordingGitRepository:
    """Record main resolution and exact-SHA checkout operations."""

    def __init__(self, source: Directory, events: list[str]) -> None:
        self.source = source
        self.events = events

    def branch(self, name: str) -> RecordingGitRef:
        self.events.append(f"branch:{name}")
        return RecordingGitRef(self.source, self.events)

    def commit(self, commit_sha: str) -> RecordingGitRef:
        self.events.append(f"commit:{commit_sha}")
        return RecordingGitRef(self.source, self.events)


class RecordingDag:
    """Record the consumer graph around Git and Foundation boundaries."""

    def __init__(self, source: Directory, result: Container) -> None:
        self.events: list[str] = []
        self.source = source
        self.shared = RecordingFoundation(result)

    def git(self, url: str) -> RecordingGitRepository:
        self.events.append(f"git:{url}")
        return RecordingGitRepository(self.source, self.events)

    def foundation(self) -> RecordingFoundation:
        self.events.append("foundation")
        return self.shared


@dataclass(frozen=True)
class RecordedSecretScan:
    """Typed test context for one public secret-scan composition."""

    subject: AmlFilter
    recorder: RecordingDag
    result: Container


def recorded_secret_scan(monkeypatch: pytest.MonkeyPatch) -> RecordedSecretScan:
    """Install one recorder without weakening the production signature."""
    source = cast(Directory, object())
    result = cast(Container, object())
    recorder = RecordingDag(source, result)
    monkeypatch.setattr(main_module, "dag", recorder)
    subject = object.__new__(AmlFilter)
    return RecordedSecretScan(subject, recorder, result)


def dagger_bin() -> str:
    """Resolve Dagger once while retaining a non-optional subprocess type."""
    executable = which("dagger")
    if executable is None:
        raise RuntimeError("dagger executable is required for module contract tests")
    return executable


DAGGER_BIN: Final = dagger_bin()
FUNCTIONS: Final = frozenset(
    {
        "dependency-audit",
        "deploy",
        "freshness",
        "live-verify",
        "preview",
        "publish-watchlist",
        "quality",
        "secret-scan",
        "signed-origin",
    }
)
CHECKS: Final = frozenset(
    {"aml-filter:dependency-audit", "aml-filter:quality", "aml-filter:secret-scan"}
)


def dagger(*arguments: str) -> str:
    """Execute the real module schema from the repository root."""
    completed: subprocess.CompletedProcess[str] = subprocess.run(
        [DAGGER_BIN, *arguments], cwd=ROOT, check=True, capture_output=True, text=True
    )
    return completed.stdout


def dagger_result(*arguments: str) -> subprocess.CompletedProcess[str]:
    """Execute a contract that intentionally inspects a failure exit code."""
    return subprocess.run(
        [DAGGER_BIN, *arguments], cwd=ROOT, check=False, capture_output=True, text=True
    )


def listed_names(output: str) -> frozenset[str]:
    """Read the first column of Dagger's stable tabular list output."""
    return frozenset(line.split()[0] for line in output.splitlines() if line.strip())


def test_should_expose_typed_pipeline_when_module_loads() -> None:
    # Given / When
    exposed = listed_names(dagger("functions"))

    # Then
    assert exposed >= FUNCTIONS


def test_should_register_security_and_quality_when_checks_load() -> None:
    # Given / When
    checks = listed_names(dagger("check", "--list"))

    # Then
    assert checks >= CHECKS


def test_should_require_typed_secrets_when_deploy_help_loads() -> None:
    # Given / When
    help_text = dagger("call", "deploy", "--help")

    # Then
    assert "--signing-key Secret" in help_text
    assert "--cloudflare-api-token Secret" in help_text
    assert "--cloudflare-account-id Secret" in help_text
    assert "--release-id string" in help_text


def test_should_supply_exec_arguments_as_dagger_list() -> None:
    # Given / When / Then
    assert isinstance(FRESHNESS_CHECK, list)


def test_should_pin_both_shared_modules_to_exact_central_main() -> None:
    config = json.loads(ROOT.joinpath("dagger.json").read_text())
    dependencies = {item["name"]: item for item in config["dependencies"]}
    for name, module in (
        ("foundation", "portfolio-foundation"),
        ("cloudflare-pages", "cloudflare-pages"),
    ):
        assert (
            dependencies[name]["source"] == f"github.com/hseshadr/ci/modules/{module}@{CENTRAL_SHA}"
        )
        assert dependencies[name]["pin"] == CENTRAL_SHA


@pytest.mark.anyio
async def test_should_materialize_exact_foundation_guard_when_secret_scan_runs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given
    context = recorded_secret_scan(monkeypatch)

    # When
    actual = await cast(Awaitable[Container], context.subject.secret_scan())

    # Then
    assert actual is context.result
    assert context.recorder.events == list(EXPECTED_GUARD_EVENTS)
    assert context.recorder.shared.call == GuardCall(
        context.recorder.source, REPOSITORY, RECORDED_SHA
    )


def test_should_reject_removed_history_override_at_exact_schema_boundary(tmp_path: Path) -> None:
    # Given / When
    result = dagger_result("call", f"--history={tmp_path}", "secret-scan")

    # Then
    assert result.returncode == 1
    assert "unknown flag: --history" in result.stderr


def test_should_reject_malformed_sha_at_real_foundation_boundary() -> None:
    # Given / When
    result = dagger_result(*MALFORMED_GUARD_CALL)

    # Then
    assert result.returncode == 1
    assert "SHA must be a lowercase 40-character hexadecimal value" in result.stderr
