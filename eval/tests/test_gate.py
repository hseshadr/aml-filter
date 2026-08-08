"""The ratchet, and proof that every tooth in it can bite.

A floor list is the easiest thing in this repository to get wrong in the way that
never shows up: a bound of 0.0 on a minimum is present, green, and measuring
nothing. `gate.py` knows that and refuses to commit one. These tests hold it to
it — every gated floor derived from the synthetic run is degraded in turn and
watched going red, and the toothless cases are constructed on purpose so the
refusal is exercised rather than assumed.
"""

from __future__ import annotations

import pytest

from amlfilter_eval.artifact import DecisionArtifact
from amlfilter_eval.gate import (
    PLATFORM_TOLERANCE,
    Direction,
    Floor,
    GateFailure,
    assert_has_teeth,
    assert_no_new_saturation,
    check,
    floors_from,
    format_failures,
    measure,
    partition,
    ratchet,
    toothless,
)
from amlfilter_eval.report import DecisionReport, build_report
from conftest import alias_queries, canonical_queries, clean_queries, decision_header


def _artifact() -> DecisionArtifact:
    """The synthetic run, built in memory so floors exist at collection time."""
    return DecisionArtifact(
        header=decision_header(),
        queries=alias_queries() + canonical_queries() + clean_queries(),
    )


REPORT: DecisionReport = build_report(_artifact())
ALL_FLOORS: tuple[Floor, ...] = floors_from(REPORT, PLATFORM_TOLERANCE)
GATED, SATURATED = partition(ALL_FLOORS)
FLOOR_IDS = ["/".join(f.key()) + f":{f.direction}" for f in GATED]


def _degrade(report: DecisionReport, floor: Floor, value: float) -> DecisionReport:
    """The same report with one gated cell's metric replaced by a worse number."""
    cell = report.cell(floor.unit, floor.pool, "balanced", floor.band)
    worse = cell.model_copy(update={"scores": cell.scores.model_copy(update={floor.metric: value})})
    return report.model_copy(
        update={"measurements": tuple(worse if m is cell else m for m in report.measurements)}
    )


def _breaching(floor: Floor) -> float:
    """A value strictly outside `floor`, in whichever direction it guards."""
    if floor.direction == "min":
        return floor.bound / 2
    return (floor.bound + 1.0) / 2


def _floor(metric: str, direction: Direction, bound: float) -> Floor:
    return Floor(
        unit="pair", pool="alias", band="kept", metric=metric, direction=direction, bound=bound
    )


def test_floors_subtract_the_tolerance_for_a_minimum() -> None:
    """A floor is today's number minus the noise, never a target someone chose."""
    precision = REPORT.cell("pair", "all+hard", "balanced", "kept").scores.precision
    assert precision == pytest.approx(0.375)
    floor = next(f for f in ALL_FLOORS if f.key() == ("pair", "all+hard", "kept", "precision"))
    assert floor.direction == "min"
    assert floor.bound == pytest.approx(0.375 - PLATFORM_TOLERANCE)


def test_floors_add_the_tolerance_for_a_ceiling() -> None:
    """FPR and FNR must not RISE, so their tolerance goes the other way."""
    fnr = REPORT.cell("pair", "all+hard", "balanced", "kept").scores.fnr
    assert fnr == pytest.approx(0.25)
    floor = next(f for f in ALL_FLOORS if f.key() == ("pair", "all+hard", "kept", "fnr"))
    assert floor.direction == "max"
    assert floor.bound == pytest.approx(0.27)


def test_floors_are_clamped_to_the_unit_interval() -> None:
    """A metric near an extreme cannot produce a bound outside [0, 1]."""
    perfect = REPORT.cell("query", "alias+plain", "balanced", "kept").scores
    assert (perfect.precision, perfect.fpr) == (1.0, 0.0)
    bounds = {f.key(): f.bound for f in ALL_FLOORS}
    assert bounds["query", "alias+plain", "kept", "fnr"] == pytest.approx(0.02)
    saturated = {f.key(): f.bound for f in SATURATED}
    assert saturated["query", "alias+hard", "kept", "fpr"] == 1.0


def test_a_min_floor_at_zero_is_toothless() -> None:
    """PROOF: the commonest defect in this portfolio, named and detected."""
    assert toothless(_floor("precision", "min", 0.0)) is True
    assert toothless(_floor("precision", "min", -0.5)) is True


def test_a_max_floor_at_one_is_toothless() -> None:
    """A ceiling of 1.0 is satisfied by every possible rate, including 1.0."""
    assert toothless(_floor("fpr", "max", 1.0)) is True
    assert toothless(_floor("fpr", "max", 1.5)) is True


def test_anything_else_has_teeth() -> None:
    """The detector must not condemn ordinary floors, or `write` never succeeds."""
    assert toothless(_floor("precision", "min", 0.0001)) is False
    assert toothless(_floor("fpr", "max", 0.9999)) is False
    assert toothless(_floor("fpr", "max", 0.0)) is False
    assert toothless(_floor("precision", "min", 1.0)) is False


def test_partition_puts_the_toothless_ones_in_the_second_tuple() -> None:
    """Saturated floors are recorded, not dropped — the baseline says so out loud."""
    blind = _floor("fpr", "max", 1.0)
    sharp = _floor("precision", "min", 0.4)
    gated, saturated = partition((sharp, blind))
    assert gated == (sharp,)
    assert saturated == (blind,)


def test_the_synthetic_run_saturates_exactly_the_hard_negative_fprs() -> None:
    """Every recombined name alerts at Balanced, so its query FPR is pinned at 1.0.

    That is a finding about the negatives' difficulty, and it belongs in the
    baseline where a reader can see it — not in the floor list, where a bound of
    1.0 would read as a passing check.
    """
    assert {f.key() for f in SATURATED} == {
        ("query", "alias+hard", "kept", "fpr"),
        ("query", "canonical+hard", "kept", "fpr"),
    }
    assert all(not toothless(f) for f in GATED)


def test_assert_has_teeth_raises_and_names_the_offenders() -> None:
    """PROOF THIS GUARD CAN FAIL — the refusal is watched, not assumed.

    A toothless floor looks exactly like a passing one, which is why it survives
    review. The message has to say which floor and which bound, or the reader
    cannot tell a real regression from a blind check.
    """
    blind = _floor("fpr", "max", 1.0)
    with pytest.raises(ValueError, match="refusing to write a baseline") as raised:
        assert_has_teeth((_floor("precision", "min", 0.4), blind))
    assert "pair/alias/kept fpr max=1.0" in str(raised.value)


def test_assert_has_teeth_accepts_a_list_that_can_all_be_breached() -> None:
    """The floors the synthetic run actually commits must survive their own guard."""
    assert assert_has_teeth(GATED) is None


def test_ratchet_keeps_the_stricter_minimum() -> None:
    """A worse re-run must not be able to lower a committed floor.

    This is the whole point of the ratchet: `--write` after a regression should
    leave the bar where it was, so the next `check` still catches the drop. If
    it took the new number, a regression would silently become the new normal.
    """
    old = (_floor("precision", "min", 0.90),)
    worse = (_floor("precision", "min", 0.40),)
    assert ratchet(worse, old)[0].bound == 0.90


def test_ratchet_keeps_the_stricter_ceiling() -> None:
    """The same rule in the other direction: an FPR ceiling can only come down."""
    old = (_floor("fpr", "max", 0.10),)
    worse = (_floor("fpr", "max", 0.60),)
    assert ratchet(worse, old)[0].bound == 0.10


def test_ratchet_takes_the_improvement_when_there_is_one() -> None:
    """Improvements DO move the bar — the ratchet is one-way, not frozen."""
    old = (_floor("precision", "min", 0.40), _floor("fpr", "max", 0.60))
    better = (_floor("precision", "min", 0.90), _floor("fpr", "max", 0.10))
    assert [f.bound for f in ratchet(better, old)] == [0.90, 0.10]


def test_ratchet_passes_new_floors_through_and_drops_retired_ones() -> None:
    """A floor with no counterpart in the old baseline is taken as measured."""
    old = (_floor("precision", "min", 0.90),)
    new = (_floor("recall", "min", 0.30),)
    assert ratchet(new, old) == new
    assert ratchet(new, None) == new


def test_ratchet_over_a_whole_regressed_run_lowers_nothing() -> None:
    """Every floor at once: re-deriving from a degraded report must change none."""
    degraded = REPORT
    for floor in GATED:
        degraded = _degrade(degraded, floor, _breaching(floor))
    held = ratchet(floors_from(degraded, PLATFORM_TOLERANCE), ALL_FLOORS)
    assert {f.key(): f.bound for f in held} == {f.key(): f.bound for f in ALL_FLOORS}


def test_check_passes_on_the_report_the_floors_came_from() -> None:
    """The baseline must grade its own measurement green, or the tolerance is wrong."""
    assert check(REPORT, GATED) == ()


@pytest.mark.parametrize("floor", GATED, ids=FLOOR_IDS)
def test_every_gated_floor_can_be_breached(floor: Floor) -> None:
    """PROOF THIS GATE CAN FAIL — once for each of the floors it commits.

    Each floor's own cell is rebuilt with a number outside the bound and the
    gate is watched returning that breach. A floor that never went red here
    would be a bound nothing in the report can move.
    """
    breaching = _breaching(floor)
    failures = check(_degrade(REPORT, floor, breaching), (floor,))
    assert len(failures) == 1
    assert (failures[0].unit, failures[0].pool, failures[0].band) == (
        floor.unit,
        floor.pool,
        floor.band,
    )
    assert failures[0].metric == floor.metric
    assert failures[0].measured == pytest.approx(breaching)
    assert failures[0].bound == floor.bound


def test_check_reports_every_breach_not_just_the_first() -> None:
    """A run that regresses in three places must say so three times."""
    degraded = REPORT
    for floor in GATED[:3]:
        degraded = _degrade(degraded, floor, _breaching(floor))
    assert len(check(degraded, GATED[:3])) == 3


def test_a_value_exactly_on_the_bound_passes() -> None:
    """The comparison is inclusive: the tolerance was already subtracted once."""
    floor = GATED[0]
    assert check(_degrade(REPORT, floor, floor.bound), (floor,)) == ()


def test_measure_is_the_predicate_the_gate_itself_uses() -> None:
    """The can-fail proof and CI must read the same number through the same code.

    A guard proven against a different code path than the one CI runs proves
    nothing about the gate, so `measure` is called directly here and its answer
    is matched against what a breach reports.
    """
    floor = next(f for f in GATED if f.key() == ("pair", "canonical", "kept", "precision"))
    assert measure(REPORT, floor) == pytest.approx(0.5)
    degraded = _degrade(REPORT, floor, 0.1)
    assert measure(degraded, floor) == pytest.approx(0.1)
    assert check(degraded, (floor,))[0].measured == measure(degraded, floor)


def test_measure_raises_on_a_floor_pointing_at_no_cell() -> None:
    """PROOF THIS GUARD CAN FAIL — a floor over a missing cell must not read 0.0.

    `all+hard` exists at the pair unit only. A gate that silently scored a
    missing cell as zero would fail every minimum and pass every ceiling, which
    is the loudest possible wrong answer and still not a measurement.
    """
    stray = Floor(
        unit="query", pool="all+hard", band="kept", metric="precision", direction="min", bound=0.5
    )
    with pytest.raises(ValueError, match=r"no query/all\+hard/balanced/kept measurement"):
        measure(REPORT, stray)


def test_the_gate_reads_balanced_and_not_the_other_levels() -> None:
    """Lenient and Strict are reported, never gated. Degrading them changes nothing."""
    cell = REPORT.cell("pair", "all+hard", "lenient", "kept")
    wrecked = cell.model_copy(update={"scores": cell.scores.model_copy(update={"precision": 0.0})})
    report = REPORT.model_copy(
        update={"measurements": tuple(wrecked if m is cell else m for m in REPORT.measurements)}
    )
    assert check(report, GATED) == ()


def test_format_failures_renders_the_sense_of_each_bound() -> None:
    """`>=` for a minimum, `<=` for a ceiling — a CI log has to be readable."""
    low = GateFailure(
        unit="pair",
        pool="alias",
        band="kept",
        metric="precision",
        direction="min",
        measured=0.25,
        bound=0.48,
    )
    high = low.model_copy(update={"metric": "fpr", "direction": "max", "bound": 0.6867})
    rendered = format_failures((low, high))
    assert "pair/alias/kept precision: measured 0.2500, required >= 0.4800" in rendered
    assert "pair/alias/kept fpr: measured 0.2500, required <= 0.6867" in rendered
    assert rendered.count("\n") == 1


def test_format_failures_on_an_empty_run_is_empty() -> None:
    """No breaches renders nothing, so a passing log carries no phantom line."""
    assert format_failures(()) == ""


def test_a_metric_that_newly_saturates_is_refused() -> None:
    """PROOF THIS GUARD CAN FAIL — and the reason it has to exist.

    `partition` on its own is a silent gate-remover. A metric that degrades all
    the way to its extreme stops being gateable, moves quietly into `saturated`,
    and the next run is GREEN with one fewer check than it started with — the
    regression deletes its own alarm and nothing in the output looks wrong.

    Here `pair/alias/kept precision` has collapsed to a bound of 0.0 while the
    committed baseline had it gated. The write must refuse.
    """
    committed = (_floor("fpr", "max", 1.0),)
    now_blind = _floor("precision", "min", 0.0)
    with pytest.raises(ValueError, match="newly saturated") as raised:
        assert_no_new_saturation((committed[0], now_blind), committed)
    assert "pair/alias/kept precision reached 0.0" in str(raised.value)


def test_inherited_saturation_is_allowed_through() -> None:
    """A metric that was already pinned is not a new regression — only growth is."""
    committed = (_floor("fpr", "max", 1.0),)
    assert assert_no_new_saturation(committed, committed) is None


def test_saturation_that_shrinks_is_allowed_through() -> None:
    """Fixing a saturated metric must not be blocked by the guard against it."""
    committed = (_floor("fpr", "max", 1.0), _floor("precision", "min", 0.0))
    assert assert_no_new_saturation((committed[0],), committed) is None


def test_the_first_write_has_nothing_to_regress_from() -> None:
    """`None` is "no committed baseline", not "an empty one" — bootstrap must work."""
    assert assert_no_new_saturation((_floor("fpr", "max", 1.0),), None) is None
