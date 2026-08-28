"""Executable schema contracts for the public Dagger module."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from shutil import which
from typing import Final

from aml_filter.main import FRESHNESS_CHECK

ROOT: Final = Path(__file__).resolve().parents[2]
CENTRAL_SHA: Final = "daebff7ebf3e69a0361b90cd7b7a767c0e4b48e1"


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


def test_should_fail_secret_scan_when_history_is_not_git(tmp_path: Path) -> None:
    # Given
    config = ROOT.joinpath(".gitleaks.toml").read_text()
    tmp_path.joinpath(".gitleaks.toml").write_text(config)

    # When
    result = dagger_result("call", f"--history={tmp_path}", "secret-scan")

    # Then
    assert result.returncode != 0
