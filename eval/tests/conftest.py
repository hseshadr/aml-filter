"""The synthetic evidence every other test in this package reasons about.

WHY IT IS HAND-SIZED
The committed baseline was measured over 5000 pair rows. Nothing can be checked
by hand at that size, so every assertion against it would have to be a
re-derivation of the code under test — which proves only that the code agrees
with itself. This artifact is eight queries and thirteen candidate rows, chosen
so that every precision, recall, F1, FPR and FNR the package reports can be
written down from a confusion matrix counted on paper and pinned as a literal.

THE ARTIFACT, AT BALANCED
Each candidate row below is (truth, alerted). `truth` is `expected` under the
committed COLLISION_VERDICT ("false-positive"); `alerted` is whether "balanced"
appears in the row's `kept` (or `primary`) list.

    query  seg           entity  expected  token  kept       primary
    A1     alias         E1      yes       yes    l,b,s      l,b,s
    A1     alias         E2      no        YES    l,b        l          <- collision
    A1     alias         E3      no        no     l          -
    A2     alias         E4      yes       yes    l,b,s      l,b
    A2     alias         E5      no        no     l,b        -
    C1     canonical     E6      yes       yes    l,b,s      l,b,s
    C1     canonical     E7      no        no     l          -
    C2     canonical     E8      yes       yes    l          -          <- miss at b
    C2     canonical     E9      no        YES    l,b        b          <- collision
    H1     clean-hard    E10     no        YES    l,b,s      b
    H2     clean-hard    E11     no        YES    l,b        -
    P1     clean-plain   E12     no        no     l          -
    P2     clean-plain   E13     no        no     -          -

Four rows have `expected=False, tokenContainment=True`. They are the collisions,
and they are why flipping the verdict moves the numbers instead of doing nothing.

RANKS ARE SET SO THE TYPESCRIPT CROSS-CHECK IS NOT TRIVIALLY TRUE
The header's `recallCheck` claims recall@1 = 0.5 and recall@10 = 1.0 for both
labelled segments. That is what the ranks below actually produce, so `abs_diff`
is 0.0 — and a test moves one rank to show the difference becoming non-zero.
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import pytest
from pydantic import BaseModel

from amlfilter_eval.artifact import (
    Candidate,
    Corpus,
    DecisionArtifact,
    Header,
    Level,
    LevelName,
    PairStudy,
    Query,
    RecallAtK,
    Sample,
    StudyHeader,
    StudyPair,
    StudyRules,
    TsSegmentRecall,
    load_decision,
    load_study,
)

#: The level lists used in the table above, named so the rows stay readable.
ALL3: tuple[LevelName, ...] = ("lenient", "balanced", "strict")
LB: tuple[LevelName, ...] = ("lenient", "balanced")
L: tuple[LevelName, ...] = ("lenient",)
B: tuple[LevelName, ...] = ("balanced",)
NONE: tuple[LevelName, ...] = ()

#: The cut the study's token_set rule is measured at. One pair sits exactly on
#: it, so the tests pin that `>=` is inclusive rather than assuming it.
ALIAS_FUZZY_SET_RATIO = 0.6


def _cand(
    entity_id: str,
    *,
    expected: bool,
    token: bool,
    score: float,
    kept: tuple[LevelName, ...],
    primary: tuple[LevelName, ...],
    rank: int | None,
) -> Candidate:
    """One candidate row. `lexical` tracks `score`; nothing here reads it."""
    return Candidate(
        entityId=entity_id,
        retrieved=rank is not None,
        score=score,
        lexical=score,
        tokenContainment=token,
        expected=expected,
        kept=kept,
        primary=primary,
        rank=rank,
    )


def alias_queries() -> tuple[Query, ...]:
    """Two alias queries: one with a collision and a no-overlap neighbour."""
    return (
        Query(
            id=1,
            segment="alias",
            query="mohamed ali",
            expected=("E1",),
            candidates=(
                _cand("E1", expected=True, token=True, score=0.95, kept=ALL3, primary=ALL3, rank=1),
                _cand("E2", expected=False, token=True, score=0.6, kept=LB, primary=L, rank=2),
                _cand("E3", expected=False, token=False, score=0.3, kept=L, primary=NONE, rank=3),
            ),
        ),
        Query(
            id=2,
            segment="alias",
            query="jon smyth",
            expected=("E4",),
            candidates=(
                _cand("E4", expected=True, token=True, score=0.9, kept=ALL3, primary=LB, rank=3),
                _cand("E5", expected=False, token=False, score=0.4, kept=LB, primary=NONE, rank=4),
            ),
        ),
    )


def canonical_queries() -> tuple[Query, ...]:
    """Two canonical queries. The second is the hard miss: right entity, dropped."""
    return (
        Query(
            id=3,
            segment="canonical",
            query="ivan petrov",
            expected=("E6",),
            candidates=(
                _cand("E6", expected=True, token=True, score=0.99, kept=ALL3, primary=ALL3, rank=1),
                _cand("E7", expected=False, token=False, score=0.2, kept=L, primary=NONE, rank=2),
            ),
        ),
        Query(
            id=4,
            segment="canonical",
            query="lena roth",
            expected=("E8",),
            candidates=(
                _cand("E8", expected=True, token=True, score=0.55, kept=L, primary=NONE, rank=2),
                _cand("E9", expected=False, token=True, score=0.5, kept=LB, primary=B, rank=1),
            ),
        ),
    )


def clean_queries() -> tuple[Query, ...]:
    """The two negative populations: recombined list tokens, then ordinary names."""
    return (
        Query(
            id=5,
            segment="clean-hard",
            query="petrov smyth",
            expected=(),
            candidates=(
                _cand("E10", expected=False, token=True, score=0.45, kept=ALL3, primary=B, rank=1),
            ),
        ),
        Query(
            id=6,
            segment="clean-hard",
            query="ali roth",
            expected=(),
            candidates=(
                _cand("E11", expected=False, token=True, score=0.42, kept=LB, primary=NONE, rank=1),
            ),
        ),
        Query(
            id=7,
            segment="clean-plain",
            query="brenda kowalczyk",
            expected=(),
            candidates=(
                _cand("E12", expected=False, token=False, score=0.25, kept=L, primary=NONE, rank=1),
            ),
        ),
        Query(
            id=8,
            segment="clean-plain",
            query="hugo lindqvist",
            expected=(),
            candidates=(
                _cand(
                    "E13", expected=False, token=False, score=0.1, kept=NONE, primary=NONE, rank=1
                ),
            ),
        ),
    )


def _levels() -> tuple[Level, ...]:
    return (
        Level(level="lenient", floor=0.3, minLexical=0.2, displayFloor=0.25),
        Level(level="balanced", floor=0.45, minLexical=0.4, displayFloor=0.5),
        Level(level="strict", floor=0.7, minLexical=0.65, displayFloor=0.75),
    )


def _recall_check() -> tuple[TsSegmentRecall, ...]:
    """What the TypeScript emitter claims. The ranks above really produce this."""
    at = (RecallAtK(k=1, hits=1, recall=0.5), RecallAtK(k=10, hits=2, recall=1.0))
    return (
        TsSegmentRecall(kind="alias", queries=2, at=at),
        TsSegmentRecall(kind="canonical", queries=2, at=at),
    )


def decision_header(*, recall_check: tuple[TsSegmentRecall, ...] | None = None) -> Header:
    """The artifact header. Pass `recall_check=()` for an artifact with no cross-check."""
    return Header(
        schemaVersion=1,
        measuredAt="2026-01-01T00:00:00.000Z",
        engineVersion="synthetic-0",
        corpus=Corpus(
            listId="synthetic-list",
            entities=13,
            fixture="synthetic.jsonl",
            fixtureSha256="a" * 64,
        ),
        levels=_levels(),
        sample=Sample(
            seed=7,
            perSegment=2,
            availableAlias=2,
            availableCanonical=2,
            cleanHardGenerated=2,
            cleanPlainGenerated=2,
        ),
        recallCheck=_recall_check() if recall_check is None else recall_check,
    )


def study_pairs() -> tuple[StudyPair, ...]:
    """Six pairs, four positive. Pair 5 sits exactly on the token_set cut."""
    return (
        StudyPair(label=1, tokenSet=0.9, tokenSort=0.85, sharedPhoneticKey=True),
        StudyPair(label=1, tokenSet=0.7, tokenSort=0.65, sharedPhoneticKey=False),
        StudyPair(label=1, tokenSet=0.4, tokenSort=0.35, sharedPhoneticKey=True),
        StudyPair(label=1, tokenSet=0.2, tokenSort=0.15, sharedPhoneticKey=False),
        StudyPair(label=0, tokenSet=ALIAS_FUZZY_SET_RATIO, tokenSort=0.55, sharedPhoneticKey=True),
        StudyPair(label=0, tokenSet=0.1, tokenSort=0.05, sharedPhoneticKey=True),
    )


def study_header() -> StudyHeader:
    return StudyHeader(
        schemaVersion=1,
        measuredAt="2026-01-01T00:00:00.000Z",
        seed=7,
        positives=4,
        negatives=2,
        rules=StudyRules(
            aliasFuzzySetRatio=ALIAS_FUZZY_SET_RATIO,
            aliasFullSortRatio=0.85,
        ),
    )


def write_jsonl(path: Path, header: BaseModel, rows: Sequence[BaseModel]) -> Path:
    """Emit header-line-then-one-line-per-row, the shape the TypeScript writes."""
    lines = [header.model_dump_json(), *(row.model_dump_json() for row in rows)]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


@pytest.fixture
def decision_path(tmp_path: Path) -> Path:
    """The synthetic decision artifact on disk, as JSONL."""
    queries = alias_queries() + canonical_queries() + clean_queries()
    return write_jsonl(tmp_path / "decision-pairs.jsonl", decision_header(), queries)


@pytest.fixture
def artifact(decision_path: Path) -> DecisionArtifact:
    """The synthetic decision artifact, parsed by the code under test."""
    return load_decision(decision_path)


@pytest.fixture
def positives_only(tmp_path: Path) -> DecisionArtifact:
    """The same artifact with both negative segments removed.

    Every query pool is then all-positive and unscoreable. `recallCheck` is
    emptied too, because the cross-check pools the labelled segment with the
    negatives to get a second class and would otherwise refuse outright.
    """
    queries = alias_queries() + canonical_queries()
    path = write_jsonl(tmp_path / "positives-only.jsonl", decision_header(recall_check=()), queries)
    return load_decision(path)


@pytest.fixture
def study_path(tmp_path: Path) -> Path:
    """The synthetic pair study on disk, as JSONL."""
    return write_jsonl(tmp_path / "pair-study.jsonl", study_header(), study_pairs())


@pytest.fixture
def study(study_path: Path) -> PairStudy:
    """The synthetic pair study, parsed by the code under test."""
    return load_study(study_path)
