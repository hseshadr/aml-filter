"""Executable contracts for the Dagger module's Python quality environment."""

from __future__ import annotations

import os
import shlex
import subprocess
import tomllib
from collections.abc import Mapping, Sequence
from pathlib import Path
from shutil import which
from typing import Final, cast

ROOT: Final = Path(__file__).resolve().parents[2]
PROJECT: Final = ROOT / ".dagger"
ALLOWED_EDITABLES: Final = "aml-filter==0.1.0\ndagger-io==0.0.0"
COMPLETE_AUDIT_INPUT: Final = "pip==26.2.1\nregistry-lib==1.2.3"
FAKE_PYTHON: Final = """#!/bin/sh
case "$*" in
  "-m pip list --editable --format=freeze") printf '%s\\n' "$EDITABLES" ;;
  "-m pip freeze --all --exclude-editable") printf '%s\\n' "$AUDIT_INPUT" ;;
  "-m pip freeze --exclude-editable") printf '%s\\n' "registry-lib==1.2.3" ;;
  *) exit 98 ;;
esac
"""
FAKE_AUDITOR: Final = """#!/bin/sh
requirements=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --requirement) requirements="$2"; shift 2 ;;
    --ignore-vuln*) exit 97 ;;
    *) shift ;;
  esac
done
printf 'called\\n' > "$AUDIT_MARKER"
test "$(cat "$requirements")" = "$EXPECTED_AUDIT_INPUT"
"""
type AuditResult = tuple[subprocess.CompletedProcess[str], Path]


def _mapping(value: object, label: str) -> Mapping[str, object]:
    """Narrow one external TOML table to the string-keyed shape we consume."""
    assert isinstance(value, dict), f"{label} must be a TOML table"
    return cast(Mapping[str, object], value)


def _document(path: Path) -> Mapping[str, object]:
    """Load one TOML document through an explicit external-data boundary."""
    parsed: object = tomllib.loads(path.read_text(encoding="utf-8"))
    return _mapping(parsed, str(path))


def _poe_tasks() -> Mapping[str, object]:
    """Return the configured Poe task registry."""
    document = _document(PROJECT / "pyproject.toml")
    tool = _mapping(document.get("tool"), "tool")
    poe = _mapping(tool.get("poe"), "tool.poe")
    return _mapping(poe.get("tasks"), "tool.poe.tasks")


def _strings(value: object, label: str) -> tuple[str, ...]:
    """Narrow one TOML string array without accepting mixed values."""
    assert isinstance(value, list), f"{label} must be a TOML array"
    assert all(isinstance(item, str) for item in value), f"{label} must contain strings"
    return tuple(cast(Sequence[str], value))


def _task_commands(name: str, tasks: Mapping[str, object]) -> tuple[tuple[str, ...], ...]:
    """Resolve a Poe command or sequence to the commands users actually run."""
    assert name in tasks, f"Poe task {name!r} is missing"
    task = tasks[name]
    if isinstance(task, str):
        return (tuple(shlex.split(task)),)
    dependencies = _strings(task, f"Poe task {name!r}")
    return tuple(command for item in dependencies for command in _task_commands(item, tasks))


def _command(commands: tuple[tuple[str, ...], ...], prefix: tuple[str, ...]) -> tuple[str, ...]:
    """Select the sole command with the requested executable prefix."""
    matches = tuple(item for item in commands if item[: len(prefix)] == prefix)
    assert len(matches) == 1, f"expected one {prefix!r} command, found {matches!r}"
    return matches[0]


def _dependency_group(name: str) -> tuple[str, ...]:
    """Return one declared dependency group."""
    document = _document(PROJECT / "pyproject.toml")
    groups = _mapping(document.get("dependency-groups"), "dependency-groups")
    return _strings(groups.get(name), f"dependency group {name!r}")


def _locked_version(name: str) -> str:
    """Return an exact package version from uv's committed resolution."""
    packages = _strings_or_tables(_document(PROJECT / "uv.lock").get("package"), "package")
    for package in packages:
        if package.get("name") == name:
            version = package.get("version")
            assert isinstance(version, str), f"locked {name!r} version must be a string"
            return version
    raise AssertionError(f"{name!r} is absent from uv.lock")


def _strings_or_tables(value: object, label: str) -> tuple[Mapping[str, object], ...]:
    """Narrow a TOML array of package tables."""
    assert isinstance(value, list), f"{label} must be a TOML array"
    return tuple(_mapping(item, label) for item in value)


def _uv_lock_check() -> subprocess.CompletedProcess[str]:
    """Run uv's frozen-resolution check through the public CLI."""
    uv = which("uv")
    assert uv is not None, "uv must be installed"
    return subprocess.run(
        [uv, "lock", "--directory", str(PROJECT), "--check"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def _poe_dry_run(name: str) -> subprocess.CompletedProcess[str]:
    """Ask Poe to render the configured task without executing it."""
    uv = which("uv")
    assert uv is not None, "uv must be installed"
    return subprocess.run(
        [uv, "run", "--directory", str(PROJECT), "poe", "--dry-run", name],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def _audit_shell() -> str:
    """Return the shell program Poe exposes as the audit task."""
    task = _mapping(_poe_tasks().get("audit"), "Poe task 'audit'")
    shell = task.get("shell")
    assert isinstance(shell, str), "Poe audit task must expose a shell program"
    return shell


def _write_tool(path: Path, source: str) -> None:
    """Install one isolated executable test double."""
    path.write_text(source, encoding="utf-8")
    path.chmod(0o700)


def _fake_bin(tmp_path: Path) -> Path:
    """Create external-command boundaries for executing the real audit shell."""
    bin_path = tmp_path / "bin"
    bin_path.mkdir()
    _write_tool(bin_path / "python", FAKE_PYTHON)
    _write_tool(bin_path / "pip-audit", FAKE_AUDITOR)
    return bin_path


def _audit_environment(bin_path: Path, marker: Path, editables: str) -> dict[str, str]:
    """Build a controlled process environment for the audit shell."""
    environment = os.environ.copy()
    environment["PATH"] = f"{bin_path}{os.pathsep}{environment['PATH']}"
    environment["EDITABLES"] = editables
    environment["AUDIT_INPUT"] = COMPLETE_AUDIT_INPUT
    environment["EXPECTED_AUDIT_INPUT"] = COMPLETE_AUDIT_INPUT
    environment["AUDIT_MARKER"] = str(marker)
    return environment


def _run_audit_shell(tmp_path: Path, editables: str) -> AuditResult:
    """Execute the configured audit shell against controlled installed packages."""
    marker = tmp_path / "audit-called"
    environment = _audit_environment(_fake_bin(tmp_path), marker, editables)
    shell = which("sh")
    assert shell is not None, "a POSIX shell must be installed"
    completed = subprocess.run(
        [shell, "-c", _audit_shell()],
        capture_output=True,
        text=True,
        check=False,
        env=environment,
    )
    return completed, marker


def test_should_offer_strict_installed_audit_when_quality_tasks_load() -> None:
    # Given / When
    completed = _poe_dry_run("audit")
    rendered = completed.stdout + completed.stderr

    # Then
    assert completed.returncode == 0, rendered
    assert "pip freeze --all --exclude-editable" in rendered
    assert "pip-audit --strict" in rendered
    assert "--requirement" in rendered
    assert "--ignore-vuln" not in rendered


def test_should_include_bootstrap_packages_when_installed_environment_is_audited(
    tmp_path: Path,
) -> None:
    # Given / When
    completed, _marker = _run_audit_shell(tmp_path, ALLOWED_EDITABLES)

    # Then
    assert completed.returncode == 0, completed.stdout + completed.stderr


def test_should_fail_closed_when_unexpected_editable_is_installed(tmp_path: Path) -> None:
    # Given
    editables = f"{ALLOWED_EDITABLES}\nrogue-local==9.9.9"

    # When
    completed, marker = _run_audit_shell(tmp_path, editables)

    # Then
    assert completed.returncode != 0
    assert not marker.exists(), "audit transport must not run after inventory rejection"


def test_should_keep_gate_fail_only_when_verification_runs() -> None:
    # Given / When
    commands = _task_commands("gate", _poe_tasks())

    # Then
    assert _command(commands, ("ruff", "check")) == ("ruff", "check", ".")
    assert _command(commands, ("ruff", "format")) == ("ruff", "format", "--check", ".")


def test_should_pin_auditor_to_the_frozen_quality_environment() -> None:
    # Given / When
    declared = tuple(item for item in _dependency_group("dev") if item.startswith("pip-audit"))

    # Then
    assert declared == (f"pip-audit=={_locked_version('pip-audit')}",)


def test_should_keep_committed_resolution_frozen_when_lock_is_checked() -> None:
    # Given / When
    completed = _uv_lock_check()

    # Then
    assert completed.returncode == 0, completed.stdout + completed.stderr
