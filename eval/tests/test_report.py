"""Decision metrics at two units and three levels, pinned to hand arithmetic.

Every expected number below was counted from the table in conftest.py's
docstring, not read off a run of this code. The synthetic artifact is small
enough that a reviewer can redo any of them on paper in under a minute — which
is the only way an assertion about a metric is evidence rather than a snapshot.
"""

from __future__ import annotations

import pytest

from amlfilter_eval.artifact import Candidate, DecisionArtifact, Query
from amlfilter_eval.collision import ALTERNATIVE_VERDICT, COLLISION_VERDICT
from amlfilter_eval.report import DecisionReport, build_report


@pytest.fixture
def report(artifact: DecisionArtifact) -> DecisionReport:
    """The synthetic run scored under the committed collision verdict."""
    return build_report(artifact)


def _rerank(artifact: DecisionArtifact, entity_id: str, rank: int | None) -> DecisionArtifact:
    """The same artifact with one candidate's emitted rank moved."""

    def moved(candidate: Candidate) -> Candidate:
        if candidate.entityId != entity_id:
            return candidate
        return candidate.model_copy(update={"rank": rank})

    queries = tuple(
        query.model_copy(update={"candidates": tuple(moved(c) for c in query.candidates)})
        for query in artifact.queries
    )
    return artifact.model_copy(update={"queries": queries})


def _assert_cell(
    report: DecisionReport,
    unit: str,
    pool: str,
    band: str,
    expected: tuple[float, float, float, float, float],
) -> None:
    """Pin (precision, recall, f1, fpr, fnr) for one Balanced cell."""
    scores = report.cell(unit, pool, "balanced", band).scores
    measured = (scores.precision, scores.recall, scores.f1, scores.fpr, scores.fnr)
    assert measured == pytest.approx(expected)


def test_header_facts_are_carried_through(report: DecisionReport) -> None:
    """The report says which run it describes, or a baseline diff is unreadable."""
    assert report.engine_version == "synthetic-0"
    assert report.fixture_sha256 == "a" * 64
    assert report.entities == 13
    assert report.seed == 7
    assert report.per_segment == 2
    assert report.collision_verdict == COLLISION_VERDICT


def test_pair_alias_kept_at_balanced(report: DecisionReport) -> None:
    """TP=2 FP=2 FN=0 TN=1 over 5 rows: E1, E2, E4, E5 alert; E3 does not."""
    cell = report.cell("pair", "alias", "balanced", "kept")
    assert (cell.scores.n, cell.scores.positives, cell.scores.alerted) == (5, 2, 4)
    _assert_cell(report, "pair", "alias", "kept", (1 / 2, 1.0, 2 / 3, 2 / 3, 0.0))
    assert cell.scores.accuracy == pytest.approx(3 / 5)


def test_pair_alias_primary_at_balanced(report: DecisionReport) -> None:
    """The primary band is clean here: TP=2 FP=0 FN=0 TN=3, everything perfect."""
    _assert_cell(report, "pair", "alias", "primary", (1.0, 1.0, 1.0, 0.0, 0.0))
    assert report.cell("pair", "alias", "balanced", "primary").scores.alerted == 2


def test_pair_canonical_at_balanced(report: DecisionReport) -> None:
    """The hard miss shows up here: TP=1 FP=1 FN=1 TN=1 in both bands.

    Query C2's correct entity (E8) is dropped at Balanced while the collision
    (E9) is kept. That is one false negative bought for one false positive, and
    it is the single most important row in the fixture.
    """
    _assert_cell(report, "pair", "canonical", "kept", (0.5, 0.5, 0.5, 0.5, 0.5))
    _assert_cell(report, "pair", "canonical", "primary", (0.5, 0.5, 0.5, 0.5, 0.5))


def test_pair_all_hard_at_balanced(report: DecisionReport) -> None:
    """The adversarial pool: TP=3 FP=5 FN=1 TN=2 over 11 rows."""
    cell = report.cell("pair", "all+hard", "balanced", "kept")
    assert (cell.scores.n, cell.scores.positives, cell.scores.alerted) == (11, 4, 8)
    _assert_cell(report, "pair", "all+hard", "kept", (3 / 8, 3 / 4, 0.5, 5 / 7, 1 / 4))


def test_pair_all_plain_at_balanced(report: DecisionReport) -> None:
    """The ordinary-name pool: TP=3 FP=3 FN=1 TN=4 over the same 11 rows.

    Same positives, fewer false positives — the two negative populations are
    bounds, and this is the lower one. They must not report the same FPR.
    """
    _assert_cell(report, "pair", "all+plain", "kept", (0.5, 3 / 4, 0.6, 3 / 7, 1 / 4))
    hard = report.cell("pair", "all+hard", "balanced", "kept").scores.fpr
    assert hard > report.cell("pair", "all+plain", "balanced", "kept").scores.fpr


def test_query_unit_at_balanced_kept(report: DecisionReport) -> None:
    """One row per screened name. Every recombined name alerts; no plain one does."""
    _assert_cell(report, "query", "alias+hard", "kept", (0.5, 1.0, 2 / 3, 1.0, 0.0))
    _assert_cell(report, "query", "canonical+hard", "kept", (0.5, 1.0, 2 / 3, 1.0, 0.0))
    _assert_cell(report, "query", "alias+plain", "kept", (1.0, 1.0, 1.0, 0.0, 0.0))
    _assert_cell(report, "query", "canonical+plain", "kept", (1.0, 1.0, 1.0, 0.0, 0.0))


def test_query_unit_at_balanced_primary(report: DecisionReport) -> None:
    """The primary band drops one hard negative: TP=2 FP=1 TN=1 FN=0."""
    _assert_cell(report, "query", "alias+hard", "primary", (2 / 3, 1.0, 0.8, 0.5, 0.0))
    _assert_cell(report, "query", "canonical+hard", "primary", (2 / 3, 1.0, 0.8, 0.5, 0.0))
    _assert_cell(report, "query", "alias+plain", "primary", (1.0, 1.0, 1.0, 0.0, 0.0))


def test_plain_pools_report_the_same_fpr(report: DecisionReport) -> None:
    """FPR reads off the negatives alone, so the pooled positives cannot move it.

    `alias+plain` and `canonical+plain` share the same clean-plain queries. If
    their FPRs ever differed, the negatives would be leaking into each other's
    measurement — the documented invariant in report.py's docstring.
    """
    alias = report.cell("query", "alias+plain", "balanced", "kept").scores.fpr
    canonical = report.cell("query", "canonical+plain", "balanced", "kept").scores.fpr
    assert alias == canonical


def test_every_level_and_band_is_measured(report: DecisionReport) -> None:
    """4 pair pools + 4 query pools, 3 levels, 2 bands, all scoreable here."""
    assert len(report.measurements) == 48
    levels = {m.level for m in report.measurements}
    assert levels == {"lenient", "balanced", "strict"}


def test_strictness_trades_false_positives_for_false_negatives(
    report: DecisionReport,
) -> None:
    """Lenient alerts on more; strict alerts on less. Visible, never averaged."""
    lenient = report.cell("pair", "all+hard", "lenient", "kept").scores
    strict = report.cell("pair", "all+hard", "strict", "kept").scores
    assert lenient.alerted > strict.alerted
    assert lenient.fpr > strict.fpr
    assert strict.fnr > lenient.fnr


def test_the_collision_verdict_moves_the_numbers(artifact: DecisionArtifact) -> None:
    """PROOF THE VERDICT CONSTANT IS NOT INERT.

    The fixture carries four collision rows (expected=False, tokenContainment
    =True). Scored under the alternative reading they become true matches, so
    pair/alias precision must rise from 2/4 to 3/4. If the two readings produced
    the same report, `COLLISION_VERDICT` would be a comment, not a control.
    """
    pessimistic = build_report(artifact, COLLISION_VERDICT)
    optimistic = build_report(artifact, ALTERNATIVE_VERDICT)
    assert pessimistic.collision_verdict != optimistic.collision_verdict
    pinned = optimistic.cell("pair", "alias", "balanced", "kept").scores
    assert pinned.precision == pytest.approx(0.75)
    assert pinned.fpr == pytest.approx(0.5)
    assert pessimistic.cell("pair", "alias", "balanced", "kept").scores.precision == 0.5


def test_the_alternative_verdict_is_the_more_flattering_one(
    artifact: DecisionArtifact,
) -> None:
    """Committed precision is a LOWER bound and committed FPR an UPPER bound.

    Asserted over every measured cell of this fixture, which is what makes
    collision.py's "flip the constant and every number improves" a checked
    statement about this evidence rather than a general claim about arithmetic.
    """
    pessimistic = build_report(artifact, COLLISION_VERDICT)
    optimistic = build_report(artifact, ALTERNATIVE_VERDICT)
    for cell in pessimistic.measurements:
        other = optimistic.cell(cell.unit, cell.pool, cell.level, cell.band)
        assert other.scores.precision >= cell.scores.precision - 1e-12
        assert other.scores.fpr <= cell.scores.fpr + 1e-12


def test_separation_is_reported_per_pair_pool(report: DecisionReport) -> None:
    """Threshold-free ordering, one number per pool, and it is not degenerate."""
    pools = dict(report.separation)
    assert set(pools) == {"alias", "canonical", "all+hard", "all+plain"}
    assert pools["alias"].roc_auc == pytest.approx(1.0)
    assert 0.0 < pools["all+hard"].roc_auc <= 1.0


def test_cell_raises_on_a_missing_cell(report: DecisionReport) -> None:
    """PROOF THIS GUARD CAN FAIL — a missing cell must never read as a zero.

    `all+hard` is a pair pool and never a query pool. Returning a default here
    would let the gate grade a metric that was never measured, and it would pass
    every `>= 0.0` floor while doing it.
    """
    with pytest.raises(ValueError, match=r"no query/all\+hard/balanced/kept measurement"):
        report.cell("query", "all+hard", "balanced", "kept")
    with pytest.raises(ValueError, match=r"no pair/alias/glacial/kept measurement"):
        report.cell("pair", "alias", "glacial", "kept")


def test_recall_checks_reproduce_the_typescript_exactly(report: DecisionReport) -> None:
    """The same evidence scored twice, in two languages, must agree to the bit."""
    assert len(report.recall_checks) == 4
    for check in report.recall_checks:
        assert check.abs_diff == 0.0
        assert check.assay_recall == check.ts_recall
    at_one = [c for c in report.recall_checks if c.k == 1]
    assert [c.assay_recall for c in at_one] == [0.5, 0.5]


def test_recall_cross_check_goes_non_zero_when_the_ranks_move(
    artifact: DecisionArtifact,
) -> None:
    """PROOF THIS CROSS-CHECK CAN FAIL — it is not two copies of one number.

    The header's recallCheck is the TypeScript's answer. Move E1 out of rank 1
    and the Python side now measures alias recall@1 as 0.0 against a header
    still claiming 0.5. A cross-check that cannot disagree is not a check, and
    this is the mutation that proves this one can.
    """
    mutated = build_report(_rerank(artifact, "E1", 5))
    at_one = {(c.segment, c.k): c for c in mutated.recall_checks}["alias", 1]
    assert at_one.ts_recall == 0.5
    assert at_one.assay_recall == 0.0
    assert at_one.abs_diff == pytest.approx(0.5)


def test_moving_a_rank_within_k_leaves_the_cross_check_green(
    artifact: DecisionArtifact,
) -> None:
    """The mutation above is specific, not a tripwire on any edit at all."""
    unmoved = build_report(_rerank(artifact, "E4", 2))
    assert all(c.abs_diff == 0.0 for c in unmoved.recall_checks if c.k == 10)


def test_unretrieved_expected_entities_never_count_as_a_hit(
    artifact: DecisionArtifact,
) -> None:
    """A candidate with no rank was never surfaced, so it cannot satisfy recall@k.

    The emitter writes a row for an acceptable entity the engine never returned,
    precisely so the miss stays in the denominator. Dropping E6's rank turns
    canonical recall@10 from 1.0 into 0.5 — if a null rank were silently treated
    as a hit, that miss would vanish from every recall number in the product.
    """
    report = build_report(_rerank(artifact, "E6", None))
    canonical = {(c.segment, c.k): c for c in report.recall_checks}["canonical", 10]
    assert canonical.ts_recall == 1.0
    assert canonical.assay_recall == pytest.approx(0.5)
    assert canonical.abs_diff == pytest.approx(0.5)


def test_single_class_pools_are_omitted_not_scored_as_zero(
    positives_only: DecisionArtifact,
) -> None:
    """PROOF THIS GUARD CAN FAIL — an unscoreable pool must vanish, not report 0.

    With both negative segments removed every query pool is all-positive.
    Precision on such a pool is undefined; sklearn's zero_division would hand
    back 0.0, which reads in a baseline as "the matcher is broken" rather than
    "the question was unanswerable". The cells must be absent entirely.
    """
    report = build_report(positives_only)
    assert {m.unit for m in report.measurements} == {"pair"}
    assert len(report.measurements) == 24
    with pytest.raises(ValueError, match=r"no query/alias\+hard/balanced/kept"):
        report.cell("query", "alias+hard", "balanced", "kept")


def test_an_artifact_with_no_recall_check_still_scores(
    positives_only: DecisionArtifact,
) -> None:
    """No TypeScript numbers to compare against is empty, not an error."""
    assert build_report(positives_only).recall_checks == ()


def test_separation_is_omitted_for_pools_it_cannot_order(
    artifact: DecisionArtifact,
) -> None:
    """PROOF THIS GUARD CAN FAIL — ROC-AUC over one class must be absent, not 0.5.

    Cut down to one alias query with only its correct entity, plus one plain
    negative. Three of the four pair pools then have a single class or no rows
    at all, and none of them may appear in `separation`: an AUC of 0.5 recorded
    against a pool that was never orderable reads as "the score is useless" when
    it means "there was nothing to order".
    """
    trimmed = artifact.model_copy(
        update={
            "header": artifact.header.model_copy(update={"recallCheck": ()}),
            "queries": (
                artifact.queries[0].model_copy(
                    update={"candidates": artifact.queries[0].candidates[:1]}
                ),
                artifact.queries[6],
            ),
        }
    )
    report = build_report(trimmed)
    assert [pool for pool, _ in report.separation] == ["all+plain"]
    assert {(m.unit, m.pool) for m in report.measurements} == {
        ("pair", "all+plain"),
        ("query", "alias+plain"),
    }


def test_report_is_frozen(report: DecisionReport) -> None:
    """The report is evidence; the gate must not be able to edit what it grades."""
    with pytest.raises(ValueError, match="frozen"):
        report.collision_verdict = ALTERNATIVE_VERDICT


def test_query_vectors_ignore_which_entity_alerted(artifact: DecisionArtifact) -> None:
    """A DOCUMENTED CONSEQUENCE, pinned so it cannot change silently.

    At the query unit a screened name counts as alerted if ANY candidate was
    shown. Query C2 alerts on the collision (E9) while its correct entity (E8)
    is dropped, so the query unit records a true positive that the pair unit
    records as one false negative and one false positive. That is the intended
    split between the analyst's queue and the compliance officer's number, and
    it is asserted here because a reader will otherwise think it is a bug.
    """
    report = build_report(artifact)
    assert report.cell("query", "canonical+plain", "balanced", "kept").scores.fnr == 0.0
    assert report.cell("pair", "canonical", "balanced", "kept").scores.fnr == 0.5


def test_a_query_with_no_candidates_at_all_is_still_a_row(
    artifact: DecisionArtifact,
) -> None:
    """A hard miss with nothing retrieved must not disappear from the denominator."""
    silent = Query(id=9, segment="canonical", query="silent", expected=("E99",), candidates=())
    widened = artifact.model_copy(update={"queries": (*artifact.queries, silent)})
    scores = build_report(widened).cell("query", "canonical+plain", "balanced", "kept").scores
    assert scores.n == 5
    assert scores.positives == 3
    assert scores.recall == pytest.approx(2 / 3)
    assert scores.fnr == pytest.approx(1 / 3)
