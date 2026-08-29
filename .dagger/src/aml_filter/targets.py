"""Validated identities for AML Filter's public Pages delivery."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Final, Self, cast

_PRODUCTION_VALUES: Final = ("hseshadr/aml-filter", "aml-filter", "main", "aml-filter.com")
_SHA_LENGTH: Final = 40
_MALFORMED_EVIDENCE: Final = "serialized green-main evidence is malformed"


@dataclass(frozen=True)
class AmlTarget:
    """The repository, Pages project, branch, and domain for production."""

    repository: str
    project: str
    branch: str
    domain: str

    def __post_init__(self) -> None:
        if (self.repository, self.project, self.branch, self.domain) != _PRODUCTION_VALUES:
            raise ValueError("AML delivery target must use the validated production values")

    @classmethod
    def production(cls) -> Self:
        """Return the immutable production delivery target."""
        return cls(*_PRODUCTION_VALUES)


@dataclass(frozen=True)
class GreenMainEvidence:
    """Exact source and workflow attempt authorized by Foundation."""

    commit_sha: str
    workflow_run_id: str
    run_attempt: int


@dataclass(frozen=True)
class ProviderIdentity:
    """Non-secret provider deployment fields safe for hosted output."""

    deployment_id: str
    deployment_url: str


def parse_green_main(serialization: str) -> GreenMainEvidence:
    """Parse only exact AML production evidence from Foundation."""
    values = _evidence_values(serialization)
    if not _valid_evidence(values):
        raise ValueError(_MALFORMED_EVIDENCE)
    commit_sha, workflow_run_id, run_attempt, _, _ = values
    return GreenMainEvidence(
        cast(str, commit_sha), cast(str, workflow_run_id), cast(int, run_attempt)
    )


def _evidence_values(serialization: str) -> tuple[object, object, object, object, object]:
    try:
        value = cast(object, json.loads(serialization))
    except json.JSONDecodeError as error:
        raise ValueError(_MALFORMED_EVIDENCE) from error
    if not isinstance(value, dict):
        raise ValueError(_MALFORMED_EVIDENCE)
    payload = cast(dict[str, object], value)
    return (
        payload.get("commit_sha"),
        payload.get("workflow_run_id"),
        payload.get("run_attempt"),
        payload.get("repository"),
        payload.get("branch"),
    )


def _valid_evidence(values: tuple[object, object, object, object, object]) -> bool:
    commit_sha, workflow_run_id, run_attempt, repository, branch = values
    return _valid_source(commit_sha, repository, branch) and _valid_attempt(
        workflow_run_id, run_attempt
    )


def _valid_source(commit_sha: object, repository: object, branch: object) -> bool:
    return (
        isinstance(commit_sha, str)
        and _is_sha(commit_sha)
        and repository == _PRODUCTION_VALUES[0]
        and branch == _PRODUCTION_VALUES[2]
    )


def _valid_attempt(workflow_run_id: object, run_attempt: object) -> bool:
    return _valid_workflow_run_id(workflow_run_id) and _valid_run_attempt(run_attempt)


def _is_sha(value: str) -> bool:
    return len(value) == _SHA_LENGTH and all(char in "0123456789abcdef" for char in value)


def _valid_workflow_run_id(value: object) -> bool:
    return isinstance(value, str) and value.isascii() and value.isdecimal() and int(value) > 0


def _valid_run_attempt(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0
