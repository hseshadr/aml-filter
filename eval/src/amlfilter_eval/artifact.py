"""The emitted evidence, parsed rather than trusted.

Both artifacts are JSONL written by
`frontend/packages/amlfilter-publisher/src/decision/`. They are GENERATED, never
committed: the same command that scores them writes them
(`pnpm --filter @amlfilter/publisher run gate:decision`), so there is no window in
which these floors could grade a run describing a matcher that is no longer in the
tree. What IS committed is `eval/baselines/decision-baseline.json`.

Every model is frozen and `extra="ignore"`: the producer may add fields freely,
the consumer pins only the contract it scores.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Final, Literal

from pydantic import BaseModel, ConfigDict

#: `src/amlfilter_eval/artifact.py` -> `eval/` -> repo root.
_REPO_ROOT: Final[Path] = Path(__file__).resolve().parents[3]

_EMITTED: Final[Path] = _REPO_ROOT / "frontend/packages/amlfilter-publisher/.decision-out"

#: Per-(query, candidate) decision rows.
DECISION_ARTIFACT: Final[Path] = _EMITTED / "decision-pairs.jsonl"

#: The name-similarity study's raw pairs.
PAIR_STUDY_ARTIFACT: Final[Path] = _EMITTED / "pair-study.jsonl"

#: Which measurement a query belongs to. Segments are never averaged together.
#: The two negative segments are BOUNDS, not two samples of one thing:
#: `clean-hard` has 100% token overlap with the list, `clean-plain` has none.
Segment = Literal["alias", "canonical", "clean-hard", "clean-plain"]

#: Which strictness level a decision was taken at.
LevelName = Literal["lenient", "balanced", "strict"]


class Level(BaseModel):
    """One strictness level, as the app defines it (mirrored in levels.ts)."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    level: LevelName
    floor: float
    minLexical: float  # noqa: N815 — wire field, matches the TypeScript emitter
    displayFloor: float  # noqa: N815


class Candidate(BaseModel):
    """One entity the decision could have shown for one query."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    entityId: str  # noqa: N815
    #: False for an acceptable entity the engine never surfaced — a hard miss
    #: that still has to be counted, which is why the emitter writes a row for it.
    retrieved: bool
    score: float
    lexical: float
    tokenContainment: bool  # noqa: N815
    #: True when this entity legitimately answers this query.
    expected: bool
    #: The levels at which the user would have been SHOWN this entity, and the
    #: levels at which it would have LED as a primary card. Computed by the
    #: TypeScript emitter's `decide.ts` and read here as facts — the screening
    #: decision is never restated in Python, because a rule written in two
    #: languages diverges and only the rendered number would show it.
    kept: tuple[LevelName, ...]
    primary: tuple[LevelName, ...]
    rank: int | None = None


class Query(BaseModel):
    """One screened query and every candidate the decision could have shown."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    id: int
    segment: Segment
    query: str
    expected: tuple[str, ...]
    candidates: tuple[Candidate, ...]


class RecallAtK(BaseModel):
    """Hit count and recall at one cut-off, as the TypeScript harness computed it."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    k: int
    hits: int
    recall: float


class TsSegmentRecall(BaseModel):
    """One segment's recall, straight from the TypeScript that has always owned it."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    kind: Literal["alias", "canonical"]
    queries: int
    at: tuple[RecallAtK, ...]


class Corpus(BaseModel):
    """Which snapshot the numbers belong to."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    listId: str  # noqa: N815
    entities: int
    fixture: str
    fixtureSha256: str  # noqa: N815


class Sample(BaseModel):
    """How the measured queries were chosen."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    seed: int
    perSegment: int  # noqa: N815
    availableAlias: int  # noqa: N815
    availableCanonical: int  # noqa: N815
    cleanHardGenerated: int  # noqa: N815
    cleanPlainGenerated: int  # noqa: N815


class Header(BaseModel):
    """What was measured, and with what."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    schemaVersion: Literal[1]  # noqa: N815
    measuredAt: str  # noqa: N815
    engineVersion: str  # noqa: N815
    corpus: Corpus
    levels: tuple[Level, ...]
    sample: Sample
    recallCheck: tuple[TsSegmentRecall, ...]  # noqa: N815


class DecisionArtifact(BaseModel):
    """A whole emitted run."""

    model_config = ConfigDict(frozen=True)

    header: Header
    queries: tuple[Query, ...]

    def level(self, name: LevelName) -> Level:
        """One strictness level, or raise — a missing level is a broken artifact."""
        for level in self.header.levels:
            if level.level == name:
                return level
        raise ValueError(f"artifact carries no {name!r} level")

    def in_segments(self, *segments: Segment) -> tuple[Query, ...]:
        """Every query in the named segments, in emission order."""
        return tuple(q for q in self.queries if q.segment in segments)


class StudyPair(BaseModel):
    """One (name, name) pair from the similarity study."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    #: 1 when the two names belong to the same designation.
    label: int
    tokenSet: float  # noqa: N815
    tokenSort: float  # noqa: N815
    sharedPhoneticKey: bool  # noqa: N815


class StudyRules(BaseModel):
    """The engine constants under test, carried by the artifact itself."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    aliasFuzzySetRatio: float  # noqa: N815
    aliasFullSortRatio: float  # noqa: N815


class StudyHeader(BaseModel):
    """What the similarity study measured."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    schemaVersion: Literal[1]  # noqa: N815
    measuredAt: str  # noqa: N815
    seed: int
    positives: int
    negatives: int
    rules: StudyRules


class PairStudy(BaseModel):
    """The similarity study's header and every scored pair."""

    model_config = ConfigDict(frozen=True)

    header: StudyHeader
    pairs: tuple[StudyPair, ...]


def _lines(path: Path) -> list[str]:
    if not path.exists():
        raise FileNotFoundError(
            f"{path} is missing. It is generated, not committed — run "
            "`pnpm --filter @amlfilter/publisher run emit-decision` first, or run "
            "`gate:decision`, which emits and scores in one command."
        )
    rows = [line for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not rows:
        raise ValueError(f"{path} is empty")
    return rows


def load_decision(path: Path = DECISION_ARTIFACT) -> DecisionArtifact:
    """Parse the decision artifact, refusing any shape it does not recognise."""
    rows = _lines(path)
    return DecisionArtifact(
        header=Header.model_validate_json(rows[0]),
        queries=tuple(Query.model_validate_json(row) for row in rows[1:]),
    )


def load_study(path: Path = PAIR_STUDY_ARTIFACT) -> PairStudy:
    """Parse the similarity study, refusing any shape it does not recognise."""
    rows = _lines(path)
    return PairStudy(
        header=StudyHeader.model_validate_json(rows[0]),
        pairs=tuple(StudyPair.model_validate_json(row) for row in rows[1:]),
    )


def write_json(path: Path, payload: BaseModel) -> None:
    """Write a model as pretty JSON with a trailing newline — a reviewable diff."""
    text = json.dumps(json.loads(payload.model_dump_json()), indent=2, sort_keys=False)
    path.write_text(f"{text}\n", encoding="utf-8")
