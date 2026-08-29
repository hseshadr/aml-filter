"""Behavior contracts for the temporary production-secret relay."""

from __future__ import annotations

import importlib
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from types import ModuleType
from typing import Final, cast

import pytest
from dagger import Container, File, Secret

from aml_filter.main import AmlFilter

BASE_IMAGE: Final = (
    "node:22.13.0-bookworm@sha256:fa54405993eaa6bab6b6e460f5f3e945a2e2f07942ba31c0e297a7d9c2041f62"
)
DOWNLOAD_SCRIPT: Final = """\
set -euo pipefail
archive=/opt/secret-relay/gh.tar.gz
root=/opt/secret-relay/gh
mkdir -p "$root"
url='https://github.com/cli/cli/releases/download/'
url="${url}v2.98.0/gh_2.98.0_linux_amd64.tar.gz"
digest='3b8ac6b30336802fc1a858d7c084e11cdf24ac1a761ca90b68022d7d729208de'
curl --fail --location --silent --show-error --output "$archive" "$url"
printf '%s  %s\\n' "$digest" "$archive" | sha256sum --check --status
tar --extract --gzip --file "$archive" --directory "$root" --strip-components=1
test -x "$root/bin/gh"
"""
DESTINATIONS: Final = (
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "WATCHLIST_SIGNING_KEY",
)
SOURCE_PATH: Final = "/run/secrets/source"
CLI_PATH: Final = "/usr/local/bin/gh"
RELAY_ENVIRONMENT: Final = (
    ("GH_PROMPT_DISABLED", "1"),
    ("GH_NO_UPDATE_NOTIFIER", "1"),
    ("DO_NOT_TRACK", "1"),
    ("GH_CONFIG_DIR", "/run/gh-config"),
    ("SECRET_RELAY_OPERATION_ID", "run-123"),
)
CONTAINER_COUNT: Final = 4
SECRET_EVENT_COUNT: Final = 6
RelayFunction = Callable[[Secret, Secret, Secret, Secret, str], Awaitable[str]]


def relay_script(destination: str) -> str:
    """Build a hand-derived exact command expected at the container boundary."""
    return (
        "set -euo pipefail\n"
        "umask 077\n"
        'mkdir -p "$GH_CONFIG_DIR"\n'
        f"gh secret set {destination} --repo hseshadr/aml-filter "
        f"--env production < {SOURCE_PATH}\n"
    )


@dataclass(frozen=True)
class Event:
    """One observable container graph operation."""

    container_id: int
    method: str
    arguments: tuple[object, ...]


@dataclass(frozen=True)
class PreparedFile:
    """Opaque file produced by the verified CLI preparation container."""

    container_id: int
    path: str


class RecordingContainer:
    """Record only the Dagger container boundary used by the relay."""

    def __init__(self, container_id: int, events: list[Event]) -> None:
        self.container_id = container_id
        self.events = events

    def record(self, method: str, *arguments: object) -> RecordingContainer:
        self.events.append(Event(self.container_id, method, arguments))
        return self

    def from_(self, image: str) -> RecordingContainer:
        return self.record("from", image)

    def with_exec(self, arguments: list[str]) -> RecordingContainer:
        return self.record("exec", tuple(arguments))

    def file(self, path: str) -> File:
        self.record("file", path)
        return cast(File, PreparedFile(self.container_id, path))

    def with_file(self, path: str, source: File) -> RecordingContainer:
        return self.record("with-file", path, source)

    def with_mounted_secret(self, path: str, source: Secret) -> RecordingContainer:
        return self.record("mounted-secret", path, source)

    def with_secret_variable(self, name: str, secret: Secret) -> RecordingContainer:
        return self.record("secret-variable", name, secret)

    def with_env_variable(self, name: str, value: str) -> RecordingContainer:
        return self.record("environment", name, value)

    async def sync(self) -> RecordingContainer:
        return self.record("sync")


class RecordingDag:
    """Create a distinct recorder for every fresh container."""

    def __init__(self) -> None:
        self.events: list[Event] = []
        self.created = 0

    def container(self) -> Container:
        self.created += 1
        return cast(Container, RecordingContainer(self.created, self.events))


def events_for(recorder: RecordingDag, container_id: int) -> tuple[Event, ...]:
    """Select one fresh container's observable graph."""
    return tuple(event for event in recorder.events if event.container_id == container_id)


def relay_module() -> ModuleType:
    """Load the relay module only after the public behavior exists."""
    return importlib.import_module("aml_filter.secret_relay")


async def call_relay(
    subject: AmlFilter,
    admin: Secret,
    sources: tuple[Secret, Secret, Secret],
) -> str:
    """Invoke the generated-decorator method through its runtime callable contract."""
    relay = cast(RelayFunction, subject.relay_production_secrets)
    return await relay(admin, sources[0], sources[1], sources[2], "run-123")


def expected_destination_events(
    container_id: int,
    cli: PreparedFile,
    admin: Secret,
    source: Secret,
    destination: str,
) -> tuple[Event, ...]:
    """Return the exact safe graph for one destination."""
    prefix = (
        Event(container_id, "from", (BASE_IMAGE,)),
        Event(container_id, "with-file", (CLI_PATH, cli)),
        Event(container_id, "mounted-secret", (SOURCE_PATH, source)),
        Event(container_id, "secret-variable", ("GH_TOKEN", admin)),
    )
    environment = tuple(Event(container_id, "environment", values) for values in RELAY_ENVIRONMENT)
    command = Event(container_id, "exec", (("bash", "-ceu", relay_script(destination)),))
    return (*prefix, *environment, command, Event(container_id, "sync", ()))


@pytest.mark.anyio
async def test_should_relay_only_allowlisted_secrets_through_fresh_sequential_containers(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    # Given
    recorder = RecordingDag()
    module = relay_module()
    monkeypatch.setattr(module, "dag", recorder)
    subject = object.__new__(AmlFilter)
    admin = cast(Secret, object())
    sources = (
        cast(Secret, object()),
        cast(Secret, object()),
        cast(Secret, object()),
    )

    # When
    result = await call_relay(subject, admin, sources)

    # Then
    assert result == "relayed 3 secrets to the production environment"
    assert recorder.created == CONTAINER_COUNT
    cli = PreparedFile(1, "/opt/secret-relay/gh/bin/gh")
    assert events_for(recorder, 1) == (
        Event(1, "from", (BASE_IMAGE,)),
        Event(1, "exec", (("bash", "-ceu", DOWNLOAD_SCRIPT),)),
        Event(1, "file", ("/opt/secret-relay/gh/bin/gh",)),
    )
    for container_id, destination, source in zip(range(2, 5), DESTINATIONS, sources, strict=True):
        expected = expected_destination_events(container_id, cli, admin, source, destination)
        assert events_for(recorder, container_id) == expected
    assert capsys.readouterr() == ("", "")


@pytest.mark.anyio
async def test_should_keep_every_secret_out_of_plaintext_arguments_and_normal_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given
    recorder = RecordingDag()
    monkeypatch.setattr(relay_module(), "dag", recorder)
    subject = object.__new__(AmlFilter)
    admin = cast(Secret, object())
    sources = (
        cast(Secret, object()),
        cast(Secret, object()),
        cast(Secret, object()),
    )
    secrets = (admin, *sources)

    # When
    await call_relay(subject, admin, sources)

    # Then
    secret_events = tuple(
        event for event in recorder.events if event.method in {"mounted-secret", "secret-variable"}
    )
    assert len(secret_events) == SECRET_EVENT_COUNT
    normal_events = tuple(
        event for event in recorder.events if event.method in {"exec", "environment"}
    )
    assert all(secret not in event.arguments for event in normal_events for secret in secrets)
    assert all("--body" not in str(event.arguments) for event in normal_events)
