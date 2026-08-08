"""Turn the emitted evidence into decision metrics, at two units and three levels.

TWO UNITS, BECAUSE THEY ANSWER DIFFERENT QUESTIONS.

  pair  — one (query, entity) row. "Of the entities we alerted on, how many were
          the entity screened?" This is the analyst's queue: every alerted row is
          something a human has to disposition.
  query — one screened name. "Of the sanctioned people we screened, how many did
          the product show nothing for, and of the clean names, how many produced
          an alert at all?" This is the compliance officer's number, and the FNR
          it produces is the one this product's launch is gated on.

NEVER AVERAGED. Segments are reported side by side. `alias` is the product's
actual promise (find the entity whose name is spelled differently), `canonical`
is the floor case, and `clean` is the generated negatives. A mean over the three
is a number about nothing.

TWO NEGATIVE POPULATIONS, REPORTED AS BOUNDS. `clean-hard` recombines real list
tokens, so every negative has 100% token overlap with the list and the lexical
gate's escape hatch fires on all of them; the FPR there saturates. `clean-plain`
is ordinary names with zero overlap. Neither is "the" false-positive rate — the
truth for a real population is between them and much nearer the plain one — and
they are never averaged, because the answer would then be set by an arbitrary
choice of mix ratio.

WHY POSITIVE SEGMENTS ARE POOLED WITH A NEGATIVE ONE. Precision, FPR and F1 need
both classes present. `alias` and `canonical` queries all have a true answer by
construction, so at the QUERY unit they are single-class and unscoreable alone —
assay refuses them, correctly. Each is therefore scored against each negative
population in turn. Recall and FNR read off the positive class and are unaffected
by which negatives are pooled; precision, F1 and accuracy depend on the mix and
are labelled with the pool they were measured on; FPR reads off the negatives
alone, so `alias+plain` and `canonical+plain` report the same FPR — it is the
plain-name alert rate.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

from amlfilter_eval.artifact import (
    Candidate,
    DecisionArtifact,
    LevelName,
    Query,
    RecallAtK,
    Segment,
)
from amlfilter_eval.assay_seam import BinaryReport, Discrimination, binary_report, discrimination
from amlfilter_eval.collision import COLLISION_VERDICT, CollisionVerdict, is_true_match

#: Which band of the result list a decision refers to. `kept` is every alert the
#: user sees; `primary` is the subset that leads as a card rather than sitting in
#: the collapsed low-confidence disclosure.
Band = Literal["kept", "primary"]

#: The levels and bands measured. Balanced is the default every user starts on
#: and is the level the floors gate; the other two are reported beside it so a
#: change that trades one against another is visible rather than averaged away.
LEVELS: tuple[LevelName, ...] = ("lenient", "balanced", "strict")
BANDS: tuple[Band, ...] = ("kept", "primary")


class Measurement(BaseModel):
    """One (unit, pool, level, band) cell of the report."""

    model_config = ConfigDict(frozen=True)

    unit: Literal["pair", "query"]
    #: The segments scored together, joined with "+".
    pool: str
    level: LevelName
    band: Band
    scores: BinaryReport


class RecallCheck(BaseModel):
    """One TypeScript recall@k number and the same number recomputed here."""

    model_config = ConfigDict(frozen=True)

    segment: str
    k: int
    ts_recall: float
    assay_recall: float
    abs_diff: float


class DecisionReport(BaseModel):
    """Everything one measured run says about the decision."""

    model_config = ConfigDict(frozen=True)

    schema_version: Literal[1] = 1
    measured_at: str
    engine_version: str
    fixture_sha256: str
    entities: int
    seed: int
    per_segment: int
    #: The reading of name collisions every number below assumes. See collision.py.
    collision_verdict: CollisionVerdict
    measurements: tuple[Measurement, ...]
    #: Threshold-free separation on the raw combined score, per positive segment.
    separation: tuple[tuple[str, Discrimination], ...]
    recall_checks: tuple[RecallCheck, ...]

    def cell(self, unit: str, pool: str, level: str, band: str) -> Measurement:
        """One cell, or raise — a missing cell is a broken report, not a zero."""
        for m in self.measurements:
            if (m.unit, m.pool, m.level, m.band) == (unit, pool, level, band):
                return m
        raise ValueError(f"report has no {unit}/{pool}/{level}/{band} measurement")


def _alerted(candidate: Candidate, level: LevelName, band: Band) -> int:
    shown = candidate.kept if band == "kept" else candidate.primary
    return 1 if level in shown else 0


def _truth(candidate: Candidate, verdict: CollisionVerdict) -> int:
    return int(
        is_true_match(
            expected=candidate.expected,
            token_containment=candidate.tokenContainment,
            verdict=verdict,
        )
    )


def _pair_vectors(
    queries: tuple[Query, ...], level: LevelName, band: Band, verdict: CollisionVerdict
) -> tuple[list[int], list[int]]:
    y_true: list[int] = []
    y_pred: list[int] = []
    for query in queries:
        for candidate in query.candidates:
            y_true.append(_truth(candidate, verdict))
            y_pred.append(_alerted(candidate, level, band))
    return y_true, y_pred


def _any_alert(query: Query, level: LevelName, band: Band) -> int:
    """Did this screened name produce ANY alert?

    Deliberately not "did the correct entity alert". At the query unit the
    question is the compliance one — was this name surfaced for review at all —
    so a name whose true match was dropped while a different designation came
    back still counts as answered here. That is not the same measurement as the
    pair unit, which records exactly one false negative and one false positive
    for that case, and the difference between the two units is the point of
    reporting both.
    """
    return 1 if any(_alerted(c, level, band) for c in query.candidates) else 0


def _query_vectors(
    queries: tuple[Query, ...], level: LevelName, band: Band
) -> tuple[list[int], list[int]]:
    """One row per screened name: did it have a true answer, and did it alert?"""
    y_true = [1 if query.expected else 0 for query in queries]
    return y_true, [_any_alert(q, level, band) for q in queries]


#: Which segments are scored together at each unit, and under what pool name.
#:
#: A negative segment has no pair-level positives (nothing legitimately answers a
#: generated name), so neither is a pair pool on its own — their alert rates are
#: the query-unit FPRs, which is where they belong.
#:
#: THE TWO NEGATIVE POPULATIONS ARE NEVER POOLED WITH EACH OTHER. `clean-hard` is
#: names recombined from real list tokens (100% token overlap; the adversarial
#: upper bound, which saturates) and `clean-plain` is ordinary names with no
#: overlap at all (the lower bound). Mixing them would produce a false-positive
#: rate whose value is set by an arbitrary choice of mix ratio.
_PAIR_POOLS: tuple[tuple[str, tuple[Segment, ...]], ...] = (
    ("alias", ("alias",)),
    ("canonical", ("canonical",)),
    ("all+hard", ("alias", "canonical", "clean-hard")),
    ("all+plain", ("alias", "canonical", "clean-plain")),
)
_QUERY_POOLS: tuple[tuple[str, tuple[Segment, ...]], ...] = (
    ("alias+hard", ("alias", "clean-hard")),
    ("alias+plain", ("alias", "clean-plain")),
    ("canonical+hard", ("canonical", "clean-hard")),
    ("canonical+plain", ("canonical", "clean-plain")),
)


def _cell(
    unit: Literal["pair", "query"],
    pool: str,
    level: LevelName,
    band: Band,
    vectors: tuple[list[int], list[int]],
) -> Measurement | None:
    """One scored cell, or None when the pool has only one class to score."""
    if len(set(vectors[0])) < 2:
        return None
    return Measurement(unit=unit, pool=pool, level=level, band=band, scores=binary_report(*vectors))


def _pair_cells(artifact: DecisionArtifact, verdict: CollisionVerdict) -> list[Measurement | None]:
    return [
        _cell("pair", pool, level, band, _pair_vectors(rows, level, band, verdict))
        for pool, segments in _PAIR_POOLS
        if (rows := artifact.in_segments(*segments))
        for level in LEVELS
        for band in BANDS
    ]


def _query_cells(artifact: DecisionArtifact) -> list[Measurement | None]:
    return [
        _cell("query", pool, level, band, _query_vectors(rows, level, band))
        for pool, segments in _QUERY_POOLS
        if (rows := artifact.in_segments(*segments))
        for level in LEVELS
        for band in BANDS
    ]


def _cells(artifact: DecisionArtifact, verdict: CollisionVerdict) -> list[Measurement]:
    """Every (unit, pool, level, band) cell that has both classes to score."""
    found = _pair_cells(artifact, verdict) + _query_cells(artifact)
    return [cell for cell in found if cell is not None]


def _candidates(artifact: DecisionArtifact, segments: tuple[Segment, ...]) -> list[Candidate]:
    return [c for q in artifact.in_segments(*segments) for c in q.candidates]


def _separated(
    artifact: DecisionArtifact, segments: tuple[Segment, ...], verdict: CollisionVerdict
) -> Discrimination | None:
    """Threshold-free separation for one pool, or None when it is single-class."""
    rows = _candidates(artifact, segments)
    y_true = [_truth(c, verdict) for c in rows]
    if len(set(y_true)) < 2:
        return None
    return discrimination(y_true, [c.score for c in rows])


def _separation(
    artifact: DecisionArtifact, verdict: CollisionVerdict
) -> tuple[tuple[str, Discrimination], ...]:
    found = ((pool, _separated(artifact, segs, verdict)) for pool, segs in _PAIR_POOLS)
    return tuple((pool, sep) for pool, sep in found if sep is not None)


def _retrieved_expected(query: Query) -> list[int]:
    """Ranks of the acceptable entities the engine actually returned."""
    return [c.rank for c in query.candidates if c.expected if c.rank is not None]


def _best_expected_rank(query: Query) -> int | None:
    ranks = _retrieved_expected(query)
    return min(ranks) if ranks else None


def _hit_within(query: Query, k: int) -> int:
    """1 when an acceptable entity was retrieved at rank <= k. Mirrors rankOfExpected."""
    best = _best_expected_rank(query)
    if best is None:
        return 0
    return int(best <= k)


def _one_recall_check(queries: tuple[Query, ...], segment: str, at: RecallAtK) -> RecallCheck:
    """One cut-off: assay's recall over the same evidence the TypeScript scored."""
    y_true = [1 if q.expected else 0 for q in queries]
    measured = binary_report(y_true, [_hit_within(q, at.k) for q in queries]).recall
    return RecallCheck(
        segment=segment,
        k=at.k,
        ts_recall=at.recall,
        assay_recall=measured,
        abs_diff=abs(measured - at.recall),
    )


def _recall_check(artifact: DecisionArtifact) -> tuple[RecallCheck, ...]:
    """Reproduce the TypeScript harness's recall@k through assay, and compare.

    The TypeScript's own `measureSegment`/`tally` computed the `recallCheck`
    numbers in the artifact header over these exact queries. Here the same
    question is posed to assay as a binary decision — "was an acceptable entity
    retrieved within k?" — over the labelled queries POOLED WITH the negatives.
    The pooling is what makes it scoreable at all: a labelled segment is
    all-positive, and assay refuses a single-class set. The negatives contribute
    y_true 0 and, having no acceptable entity, y_pred 0, so they change nothing
    about the recall of the positive class. Assay's recall is therefore exactly
    hits/queries over the labelled segment — the number the TypeScript reports.
    """
    clean = artifact.in_segments("clean-hard", "clean-plain")
    return tuple(
        _one_recall_check(artifact.in_segments(segment.kind) + clean, segment.kind, at)
        for segment in artifact.header.recallCheck
        for at in segment.at
    )


def build_report(
    artifact: DecisionArtifact, verdict: CollisionVerdict = COLLISION_VERDICT
) -> DecisionReport:
    """Score one emitted run under one reading of name collisions."""
    header = artifact.header
    return DecisionReport(
        measured_at=header.measuredAt,
        engine_version=header.engineVersion,
        fixture_sha256=header.corpus.fixtureSha256,
        entities=header.corpus.entities,
        seed=header.sample.seed,
        per_segment=header.sample.perSegment,
        collision_verdict=verdict,
        measurements=tuple(_cells(artifact, verdict)),
        separation=_separation(artifact, verdict),
        recall_checks=_recall_check(artifact),
    )
