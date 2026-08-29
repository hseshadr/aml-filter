"""Executable schema contracts for the public Dagger module."""

from __future__ import annotations

import importlib
import inspect
import json
import os
import subprocess
import textwrap
from collections.abc import Awaitable
from dataclasses import dataclass
from pathlib import Path
from shutil import which
from typing import Final, cast

import pytest
from dagger import Container, Directory, Secret

import aml_filter.main as main_module
from aml_filter.main import (
    FRESHNESS_CHECK,
    REPOSITORY,
    REPOSITORY_URL,
    AmlFilter,
    PublishRequest,
)
from aml_filter.policy import ReleaseKind, release_identity

ROOT: Final = Path(__file__).resolve().parents[2]
CENTRAL_SHA: Final = "daebff7ebf3e69a0361b90cd7b7a767c0e4b48e1"
FOUNDATION_MODULE: Final = f"github.com/hseshadr/ci/modules/portfolio-foundation@{CENTRAL_SHA}"
CLOUDFLARE_MODULE: Final = f"github.com/hseshadr/ci/modules/cloudflare-pages@{CENTRAL_SHA}"
REAL_PROVIDER_DEPENDENCIES: Final = (
    ("foundation", FOUNDATION_MODULE),
    ("cloudflare-pages", CLOUDFLARE_MODULE),
)
RECORDED_SHA: Final = "0123456789abcdef0123456789abcdef01234567"
RECORDED_RUN_ID: Final = "123456"
RECORDED_ATTEMPT: Final = 2
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
PRETRANSPORT_SOURCE: Final = """\
from dagger import dag, function, object_type

SHA = "daebff7ebf3e69a0361b90cd7b7a767c0e4b48e1"
COMMIT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
REPOSITORY = "hseshadr/aml-filter"


@object_type
class Pretransport:
    @function
    async def tampered_deploy(self) -> str:
        artifact = dag.directory().with_new_file("dist/index.html", "valid")
        envelope = dag.foundation().envelope(
            artifact, f"{REPOSITORY}@{COMMIT}", f"{SHA}:123456", ["dist"]
        )
        tampered = envelope.with_new_file("artifact/dist/index.html", "tampered")
        github = dag.set_secret("github", "synthetic-github-token")
        api = dag.set_secret("cloudflare-api", "synthetic-cloudflare-token")
        account = dag.set_secret("cloudflare-account", "synthetic-cloudflare-account")
        evidence = dag.cloudflare_pages().deploy(
            tampered, github, api, account, "123456", 2,
            REPOSITORY, "aml-filter", "main", "aml-filter.com", "dist", [],
            f"{REPOSITORY}@{COMMIT}", f"{SHA}:123456", ["dist"],
        )
        return await evidence.deployment_id()
"""


def green_main_json(
    commit_sha: object = RECORDED_SHA,
    workflow_run_id: object = RECORDED_RUN_ID,
    run_attempt: object = RECORDED_ATTEMPT,
    repository: object = REPOSITORY,
    branch: object = "main",
) -> str:
    """Build an external serialized-evidence fixture with explicit boundary values."""
    return json.dumps(
        {
            "branch": branch,
            "commit_sha": commit_sha,
            "repository": repository,
            "run_attempt": run_attempt,
            "workflow_run_id": workflow_run_id,
        }
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


class ReleaseContainerRecorder:
    """Record release-base composition without materializing a container."""

    def __init__(self, events: list[str]) -> None:
        self.events = events

    def with_mounted_cache(self, path: str, volume: object) -> ReleaseContainerRecorder:
        del volume
        self.events.append(f"cache:{path}")
        return self

    def with_directory(self, path: str, directory: object) -> ReleaseContainerRecorder:
        del directory
        self.events.append(f"directory:{path}")
        return self

    def with_env_variable(self, name: str, value: str) -> ReleaseContainerRecorder:
        self.events.append(f"env:{name}={value}")
        return self

    def with_service_binding(self, name: str, service: object) -> ReleaseContainerRecorder:
        del service
        self.events.append(f"service:{name}")
        return self

    def with_exec(self, arguments: list[str]) -> ReleaseContainerRecorder:
        self.events.append(f"exec:{' '.join(arguments)}")
        return self


class ReleaseGitRefRecorder:
    """Return one inert EdgeProc directory for the release-base graph."""

    def tree(self) -> Directory:
        return cast(Directory, object())


class ReleaseGitRecorder:
    """Record the exact pinned EdgeProc commit."""

    def __init__(self, events: list[str]) -> None:
        self.events = events

    def commit(self, commit_sha: str) -> ReleaseGitRefRecorder:
        self.events.append(f"edgeproc:{commit_sha}")
        return ReleaseGitRefRecorder()


class ReleaseDagRecorder:
    """Provide only the Dagger calls needed by ``_release_base``."""

    def __init__(self, events: list[str]) -> None:
        self.events = events

    def cache_volume(self, name: str) -> object:
        self.events.append(f"cache-volume:{name}")
        return object()

    def git(self, url: str) -> ReleaseGitRecorder:
        self.events.append(f"git:{url}")
        return ReleaseGitRecorder(self.events)


@dataclass(frozen=True)
class ProviderCall:
    """Exact provider mutation boundary observed by the consumer test."""

    arguments: tuple[object, ...]


class DeliveryDirectoryRecorder:
    """Record the single artifact root packaged for Foundation."""

    def __init__(self, events: list[str]) -> None:
        self.events = events

    def with_directory(self, path: str, directory: Directory) -> Directory:
        del directory
        self.events.append(f"package:{path}")
        return cast(Directory, self)


class GreenMainRecorder:
    """Materialize the canonical Foundation evidence once."""

    def __init__(self, events: list[str]) -> None:
        self.events = events

    async def serialization(self) -> str:
        self.events.append("materialize:green-main")
        return green_main_json()


class DeliveryGitRefRecorder:
    """Produce a complete exact-commit source tree."""

    def __init__(self, events: list[str], source: Directory) -> None:
        self.events = events
        self.source = source

    def tree(self, *, depth: int, include_tags: bool) -> Directory:
        self.events.append(f"tree:{depth}:tags={include_tags}")
        return self.source


class DeliveryGitRecorder:
    """Bind the public Git graph to a single evidence SHA."""

    def __init__(self, events: list[str], source: Directory) -> None:
        self.events = events
        self.source = source

    def commit(self, commit_sha: str) -> DeliveryGitRefRecorder:
        self.events.append(f"commit:{commit_sha}")
        return DeliveryGitRefRecorder(self.events, self.source)


class DeliveryFoundationRecorder:
    """Record green-main, source binding, and envelope composition."""

    def __init__(self, context: RecordedDelivery) -> None:
        self.context = context

    def green_main(self, github_token: Secret, repository: str) -> GreenMainRecorder:
        assert github_token is self.context.github_token
        assert repository == REPOSITORY
        self.context.events.append("construct:green-main")
        return GreenMainRecorder(self.context.events)

    def source(self, source: Directory, repository: str, commit_sha: str) -> Directory:
        assert source is self.context.fetched_source
        assert (repository, commit_sha) == (REPOSITORY, RECORDED_SHA)
        self.context.events.append("foundation:source")
        return self.context.bound_source

    def envelope(
        self,
        artifact: Directory,
        consumer_identity: str,
        producing_identity: str,
        allowed_roots: list[str],
    ) -> Directory:
        if self.context.fail_envelope:
            raise RuntimeError("envelope failed")
        self.context.events.append("construct:envelope")
        self.context.envelope_values = (
            artifact,
            consumer_identity,
            producing_identity,
            tuple(allowed_roots),
        )
        return self.context.envelope


class ProviderEvidenceRecorder:
    """Distinguish deployment graph construction from mutation materialization."""

    def __init__(self, context: RecordedDelivery) -> None:
        self.context = context

    async def id(self) -> str:
        self.context.events.append("materialize:deploy")
        if self.context.fail_materialization:
            raise RuntimeError("provider materialization failed")
        return "provider-evidence-id"


class StoredProviderEvidenceRecorder:
    """Expose only the nominally reloaded non-secret deployment fields."""

    def __init__(self, events: list[str]) -> None:
        self.events = events

    async def deployment_id(self) -> str:
        self.events.append("stored:deployment-id")
        return "deployment-123"

    async def deployment_url(self) -> str:
        self.events.append("stored:deployment-url")
        return "https://deployment.example.pages.dev"


class ProviderRecorder:
    """Record exactly one generated-provider deploy call."""

    def __init__(self, context: RecordedDelivery) -> None:
        self.context = context

    def deploy(self, *arguments: object) -> ProviderEvidenceRecorder:
        assert arguments[1:4] == (
            self.context.github_token,
            self.context.api_token,
            self.context.account_id,
        )
        self.context.events.append("construct:deploy")
        self.context.provider_call = ProviderCall(arguments)
        return ProviderEvidenceRecorder(self.context)


@dataclass
class RecordedDelivery:
    """All inert objects and events for one publication attempt."""

    events: list[str]
    fetched_source: Directory
    bound_source: Directory
    release: Directory
    app: Directory
    envelope: Directory
    signing_key: Secret
    api_token: Secret
    account_id: Secret
    github_token: Secret
    fail_envelope: bool = False
    fail_materialization: bool = False
    envelope_values: tuple[object, str, str, tuple[str, ...]] | None = None
    provider_call: ProviderCall | None = None


class DeliveryDagRecorder:
    """Provide only the generated boundaries used by production orchestration."""

    def __init__(self, context: RecordedDelivery) -> None:
        self.context = context

    def foundation(self) -> DeliveryFoundationRecorder:
        return DeliveryFoundationRecorder(self.context)

    def git(self, url: str) -> DeliveryGitRecorder:
        assert url == REPOSITORY_URL
        self.context.events.append(f"git:{url}")
        return DeliveryGitRecorder(self.context.events, self.context.fetched_source)

    def directory(self) -> Directory:
        return cast(Directory, DeliveryDirectoryRecorder(self.context.events))

    def cloudflare_pages(self) -> ProviderRecorder:
        return ProviderRecorder(self.context)

    def load_cloudflare_pages_deployment_evidence_from_id(
        self, evidence_id: object
    ) -> StoredProviderEvidenceRecorder:
        assert str(evidence_id) == "provider-evidence-id"
        self.context.events.append("load:provider-evidence-id")
        return StoredProviderEvidenceRecorder(self.context.events)


class ProductContainerRecorder:
    """Materialize only preview and live product proof in unit tests."""

    def __init__(self, label: str, context: RecordedDelivery) -> None:
        self.label = label
        self.context = context

    def directory(self, path: str) -> Directory:
        self.context.events.append(f"directory:{self.label}:{path}")
        return self.context.release if self.label == "release" else self.context.app

    async def sync(self) -> ProductContainerRecorder:
        self.context.events.append("preview")
        return self

    async def stdout(self) -> str:
        self.context.events.append("live" if self.label == "live" else "direct-upload")
        return "live product proof" if self.label == "live" else "legacy upload"


class ProductMethodRecorder:
    """Replace product-only build and verification containers."""

    def __init__(self, context: RecordedDelivery) -> None:
        self.context = context

    def signed_release(
        self,
        source: Directory,
        signing_key: Secret,
        version: str,
        kind: ReleaseKind,
    ) -> Container:
        assert (source, signing_key) == (self.context.bound_source, self.context.signing_key)
        assert version
        self.context.events.append(f"sign:{kind.value}")
        return cast(Container, ProductContainerRecorder("release", self.context))

    def release_app(
        self,
        source: Directory,
        release: Directory,
        source_sha: str,
        run_id: str,
    ) -> Container:
        assert (source, release) == (self.context.bound_source, self.context.release)
        self.context.events.append(f"stamp:{source_sha}:{run_id}")
        return cast(Container, ProductContainerRecorder("app", self.context))

    def preview_verify(
        self,
        source: Directory,
        app: Directory,
        release: Directory,
        identity: object,
    ) -> Container:
        del identity
        expected = (self.context.bound_source, self.context.app, self.context.release)
        assert (source, app, release) == expected
        return cast(Container, ProductContainerRecorder("preview", self.context))

    def live_verify(
        self,
        source: Directory,
        release: Directory,
        identity: object,
    ) -> Container:
        del identity
        assert (source, release) == (self.context.bound_source, self.context.release)
        return cast(Container, ProductContainerRecorder("live", self.context))

    def direct_upload(
        self,
        source: Directory,
        app: Directory,
        token: Secret,
        account_id: Secret,
    ) -> Container:
        del source, app, token, account_id
        return cast(Container, ProductContainerRecorder("upload", self.context))


def recorded_delivery() -> RecordedDelivery:
    """Create distinct opaque values so identity mistakes cannot pass."""
    return RecordedDelivery(
        events=[],
        fetched_source=cast(Directory, object()),
        bound_source=cast(Directory, object()),
        release=cast(Directory, object()),
        app=cast(Directory, object()),
        envelope=cast(Directory, object()),
        signing_key=cast(Secret, object()),
        api_token=cast(Secret, object()),
        account_id=cast(Secret, object()),
        github_token=cast(Secret, object()),
    )


def install_product_recorders(
    monkeypatch: pytest.MonkeyPatch, context: RecordedDelivery
) -> AmlFilter:
    """Replace product containers while retaining real delivery orchestration."""
    recorder = ProductMethodRecorder(context)
    monkeypatch.setattr(main_module, "dag", DeliveryDagRecorder(context))
    monkeypatch.setattr(AmlFilter, "_signed_release", recorder.signed_release)
    monkeypatch.setattr(AmlFilter, "_release_app", recorder.release_app)
    monkeypatch.setattr(AmlFilter, "_preview_verify", recorder.preview_verify)
    monkeypatch.setattr(AmlFilter, "_live_verify", recorder.live_verify)
    monkeypatch.setattr(AmlFilter, "_upload", recorder.direct_upload, raising=False)
    subject = object.__new__(AmlFilter)
    subject.source = cast(Directory, object())
    return subject


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


def run_real_dagger(directory: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    """Run an isolated real module without inheriting credential values."""
    environment = {**os.environ, "DAGGER_NO_NAG": "1"}
    return subprocess.run(
        [DAGGER_BIN, *arguments],
        cwd=directory,
        check=False,
        capture_output=True,
        env=environment,
        text=True,
    )


def require_dagger_success(result: subprocess.CompletedProcess[str]) -> None:
    """Retain the real Dagger diagnostics when bootstrap fails."""
    assert result.returncode == 0, result.stdout + result.stderr


def real_provider_module(tmp_path: Path) -> Path:
    """Build one isolated exact-pin consumer for the pre-transport proof."""
    module = tmp_path / "real-provider"
    require_dagger_success(
        run_real_dagger(tmp_path, "init", "--sdk", "python", "--name", "pretransport", str(module))
    )
    for name, dependency in REAL_PROVIDER_DEPENDENCIES:
        require_dagger_success(run_real_dagger(module, "install", dependency, "--name", name))
    source = module / "src" / "pretransport" / "main.py"
    source.write_text(textwrap.dedent(PRETRANSPORT_SOURCE), encoding="utf-8")
    require_dagger_success(run_real_dagger(module, "develop"))
    return module


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
    help_texts = (
        dagger("call", "deploy", "--help"),
        dagger("call", "publish-watchlist", "--help"),
    )

    # Then
    for help_text in help_texts:
        assert "--signing-key Secret" in help_text
        assert "--cloudflare-api-token Secret" in help_text
        assert "--cloudflare-account-id Secret" in help_text
        assert "--github-token Secret" in help_text
        assert "--release-id string" in help_text


def test_should_supply_exec_arguments_as_dagger_list() -> None:
    # Given / When / Then
    assert isinstance(FRESHNESS_CHECK, list)


def test_should_bind_the_only_production_pages_target() -> None:
    # Given / When
    try:
        targets = importlib.import_module("aml_filter.targets")
    except ModuleNotFoundError:
        pytest.fail("AML delivery target is missing", pytrace=False)

    # Then
    production = targets.AmlTarget.production()
    assert production == targets.AmlTarget(
        "hseshadr/aml-filter", "aml-filter", "main", "aml-filter.com"
    )


@pytest.mark.parametrize(
    "values",
    [
        ("other/aml-filter", "aml-filter", "main", "aml-filter.com"),
        ("hseshadr/aml-filter", "other", "main", "aml-filter.com"),
        ("hseshadr/aml-filter", "aml-filter", "release", "aml-filter.com"),
        ("hseshadr/aml-filter", "aml-filter", "main", "other.example"),
    ],
)
def test_should_reject_target_when_any_production_value_differs(
    values: tuple[str, str, str, str],
) -> None:
    # Given
    targets = importlib.import_module("aml_filter.targets")

    # When / Then
    with pytest.raises(ValueError, match="validated production values"):
        targets.AmlTarget(*values)


def test_should_parse_exact_green_main_evidence() -> None:
    # Given
    targets = importlib.import_module("aml_filter.targets")

    # When
    evidence = targets.parse_green_main(green_main_json())

    # Then
    assert evidence.commit_sha == RECORDED_SHA
    assert evidence.workflow_run_id == RECORDED_RUN_ID
    assert evidence.run_attempt == RECORDED_ATTEMPT


@pytest.mark.parametrize("serialization", ["{", "[]", "null", '"not-an-object"'])
def test_should_reject_green_main_when_serialization_is_malformed(serialization: str) -> None:
    # Given
    targets = importlib.import_module("aml_filter.targets")

    # When / Then
    with pytest.raises(ValueError, match="green-main evidence is malformed"):
        targets.parse_green_main(serialization)


@pytest.mark.parametrize(
    "serialization",
    [
        green_main_json(repository="other/repository"),
        green_main_json(branch="release"),
        green_main_json(commit_sha="A" * 40),
        green_main_json(commit_sha="a" * 39),
        green_main_json(workflow_run_id="0"),
        green_main_json(workflow_run_id="12x"),
        green_main_json(workflow_run_id=123456),
        green_main_json(run_attempt=0),
        green_main_json(run_attempt=-1),
        green_main_json(run_attempt=True),
        green_main_json(run_attempt="1"),
    ],
)
def test_should_reject_green_main_when_identity_or_attempt_is_not_exact(
    serialization: str,
) -> None:
    # Given
    targets = importlib.import_module("aml_filter.targets")

    # When / Then
    with pytest.raises(ValueError, match="green-main evidence is malformed"):
        targets.parse_green_main(serialization)


def test_should_bind_edgeproc_directory_when_release_base_is_built(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given
    events: list[str] = []
    source = cast(Directory, object())
    recorder = ReleaseContainerRecorder(events)

    def node(_subject: AmlFilter, actual: Directory) -> Container:
        assert actual is source
        events.append("node:bound-source")
        return cast(Container, recorder)

    monkeypatch.setattr(main_module, "dag", ReleaseDagRecorder(events))
    monkeypatch.setattr(AmlFilter, "_node", node)
    monkeypatch.setattr(AmlFilter, "_with_uv", lambda _subject, container: container)
    subject = object.__new__(AmlFilter)

    # When
    actual = subject._release_base(source)

    # Then
    assert actual is cast(Container, recorder)
    assert "directory:/edgeproc" in events
    assert "env:EDGEPROC_DIR=/edgeproc" in events


def test_should_bind_preview_service_to_exact_foundation_source(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given
    events: list[str] = []
    source = cast(Directory, object())
    app = cast(Directory, object())
    release = cast(Directory, object())
    recorder = ReleaseContainerRecorder(events)

    def verify(_subject: AmlFilter, *arguments: object) -> Container:
        assert arguments[0] is source
        return cast(Container, recorder)

    def exact_preview(
        _subject: AmlFilter, actual_source: Directory, actual_app: Directory
    ) -> object:
        assert (actual_source, actual_app) == (source, app)
        events.append("preview:bound-source")
        return object()

    def legacy_preview(_subject: AmlFilter, actual_app: Directory) -> object:
        del actual_app
        raise AssertionError("public workspace preview bypassed the bound source")

    monkeypatch.setattr(AmlFilter, "_verify_container", verify)
    monkeypatch.setattr(AmlFilter, "_preview", exact_preview, raising=False)
    monkeypatch.setattr(AmlFilter, "preview", legacy_preview)
    subject = object.__new__(AmlFilter)

    # When
    actual = subject._preview_verify(source, app, release, release_identity(RECORDED_SHA, "9999"))

    # Then
    assert actual is cast(Container, recorder)
    assert "preview:bound-source" in events


@pytest.mark.anyio
@pytest.mark.parametrize("kind", [ReleaseKind.CODE, ReleaseKind.WATCHLIST])
async def test_should_materialize_one_provider_deploy_before_live_verification(
    monkeypatch: pytest.MonkeyPatch, kind: ReleaseKind
) -> None:
    # Given
    context = recorded_delivery()
    subject = install_product_recorders(monkeypatch, context)
    request = PublishRequest(
        kind,
        context.signing_key,
        context.api_token,
        context.account_id,
        context.github_token,
        f"{RECORDED_SHA}:9999",
    )

    # When
    result = await subject._publish(request)

    # Then
    assert result.startswith(
        "provider deployment verified: id=deployment-123 url=https://deployment.example.pages.dev"
    )
    assert context.events.count("construct:deploy") == 1
    assert context.events.count("materialize:deploy") == 1
    assert context.events.index("materialize:deploy") < context.events.index("live")
    assert f"sign:{kind.value}" in context.events


@pytest.mark.anyio
async def test_should_bind_exact_source_and_identities_when_provider_deploys(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given
    context = recorded_delivery()
    subject = install_product_recorders(monkeypatch, context)
    request = PublishRequest(
        ReleaseKind.CODE,
        context.signing_key,
        context.api_token,
        context.account_id,
        context.github_token,
        f"{RECORDED_SHA}:9999",
    )

    # When
    await subject._publish(request)

    # Then
    consumer = f"{REPOSITORY}@{RECORDED_SHA}"
    producing = f"{CENTRAL_SHA}:{RECORDED_RUN_ID}"
    assert context.events[:6] == [
        "construct:green-main",
        "materialize:green-main",
        f"git:{REPOSITORY_URL}",
        f"commit:{RECORDED_SHA}",
        "tree:0:tags=True",
        "foundation:source",
    ]
    assert context.envelope_values is not None
    assert context.envelope_values[1:] == (consumer, producing, ("dist",))
    assert context.provider_call == ProviderCall(
        (
            context.envelope,
            context.github_token,
            context.api_token,
            context.account_id,
            RECORDED_RUN_ID,
            RECORDED_ATTEMPT,
            REPOSITORY,
            "aml-filter",
            "main",
            "aml-filter.com",
            "dist",
            [],
            consumer,
            producing,
            ["dist"],
        )
    )
    assert f"stamp:{RECORDED_SHA}:9999" in context.events


@pytest.mark.anyio
async def test_should_reject_release_when_product_sha_differs_from_green_main(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given
    context = recorded_delivery()
    subject = install_product_recorders(monkeypatch, context)
    request = PublishRequest(
        ReleaseKind.CODE,
        context.signing_key,
        context.api_token,
        context.account_id,
        context.github_token,
        f"{'a' * 40}:9999",
    )

    # When / Then
    with pytest.raises(ValueError, match="green-main SHA"):
        await subject._publish(request)
    assert "construct:deploy" not in context.events
    assert "live" not in context.events


@pytest.mark.anyio
async def test_should_stop_before_provider_when_envelope_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given
    context = recorded_delivery()
    context.fail_envelope = True
    subject = install_product_recorders(monkeypatch, context)
    request = PublishRequest(
        ReleaseKind.CODE,
        context.signing_key,
        context.api_token,
        context.account_id,
        context.github_token,
        f"{RECORDED_SHA}:9999",
    )

    # When / Then
    with pytest.raises(RuntimeError, match="envelope failed"):
        await subject._publish(request)
    assert "construct:deploy" not in context.events
    assert "live" not in context.events


@pytest.mark.anyio
async def test_should_stop_before_live_when_provider_materialization_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given
    context = recorded_delivery()
    context.fail_materialization = True
    subject = install_product_recorders(monkeypatch, context)
    request = PublishRequest(
        ReleaseKind.WATCHLIST,
        context.signing_key,
        context.api_token,
        context.account_id,
        context.github_token,
        f"{RECORDED_SHA}:9999",
    )

    # When / Then
    with pytest.raises(RuntimeError, match="provider materialization failed"):
        await subject._publish(request)
    assert context.events.count("construct:deploy") == 1
    assert context.events.count("materialize:deploy") == 1
    assert "live" not in context.events


def test_should_keep_provider_mutation_inside_shared_module() -> None:
    # Given / When
    source = inspect.getsource(main_module)

    # Then
    for forbidden in (
        "WRANGLER_DEPLOY",
        "def _upload",
        ".verify_envelope(",
        ".preflight(",
        "wrangler pages deploy",
    ):
        assert forbidden not in source


@pytest.mark.skipif(
    os.environ.get("DAGGER_REAL_PROVIDER_PRETRANSPORT") != "1",
    reason="set DAGGER_REAL_PROVIDER_PRETRANSPORT=1 for the no-secret provider proof",
)
def test_should_reject_real_provider_before_transport_when_envelope_is_tampered(
    tmp_path: Path,
) -> None:
    # Given
    module = real_provider_module(tmp_path)
    config = json.loads(module.joinpath("dagger.json").read_text(encoding="utf-8"))

    # When
    result = run_real_dagger(module, "call", "tampered-deploy")
    output = result.stdout + result.stderr

    # Then
    dependencies = {item["name"]: item["pin"] for item in config["dependencies"]}
    assert dependencies == {"foundation": CENTRAL_SHA, "cloudflare-pages": CENTRAL_SHA}
    assert result.returncode != 0
    assert "Foundation.verifyEnvelope" in output
    assert "artifact bytes or modes differ from manifest" in output
    assert "Foundation.greenMain" not in output
    assert "api.github.com" not in output
    assert "api.cloudflare.com" not in output


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
