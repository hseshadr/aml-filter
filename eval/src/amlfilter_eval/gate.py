"""The decision ratchet: this product's decision quality may improve, never regress.

WHAT THIS GATES
Every floor is TODAY'S MEASURED NUMBER minus a tolerance, not a target. A
threshold chosen after a matcher change measures nothing, because you can always
pick one the new code clears. Pinned at the baseline, the gate answers exactly one
question: did this change make the DECISION worse?

FLOORS RATCHET UP ONLY
`--write` refreshes the baseline after a change moves the numbers. Whatever is
already committed is kept wherever it is stricter, so re-running the tool can
never lower a bar. If a floor genuinely has to come down, it takes a hand edit to
the committed baseline — a visible, arguable diff, exactly as it should be. This
is the same rule the recall harness enforces, for the same reason.

TOLERANCE, AND WHY IT IS COUNTED IN ROWS
The corpus vectors come from a quantized ONNX model whose last-bit arithmetic is
not identical across CPU architectures, so a candidate sitting within ~1e-4 of a
threshold can flip between an arm64 laptop and an x86_64 runner. The tolerance is
the width of that noise; it is applied ONCE, when the floor is written, and the
comparison here is exact.

That noise is a number of ROWS, not a rate, and the difference is not academic —
it was measured. A flat 0.02 rate was the first thing tried, and a watched red run
found the hole: the pair-level false-negative rate has a baseline of 0.0010 over
25,013 rows, so a flat 0.02 gave it a ceiling twenty times its own value. A
mutation that made the lexical signal blind to published aliases — the exact
historical defect `bestNameSimilarity` was written to fix — raised that FNR to
0.0128, a twelvefold regression, and the gate stayed GREEN.

So the slack is `min(PLATFORM_TOLERANCE, TOLERANCE_ROWS / n)`: never wider than a
fixed count of rows. At the query unit (n=2,000) that is the same 0.02 the recall
harness has always used; at the pair unit (n=25,013) it is 0.0016, and the same
mutation now goes red. The absolute cap still applies to small pools, so a segment
that shrinks cannot tighten itself into flakiness.

WHICH NUMBERS ARE GATED
The Balanced level, both bands, at both units — that is the level every user
starts on. Lenient and Strict are measured and committed but not gated: they are
reported so a change that trades one level against another is visible, and gating
all three would make a deliberate re-balance impossible to land without an
argument in three places at once.
"""

from __future__ import annotations

from typing import Final, Literal

from pydantic import BaseModel, ConfigDict

from amlfilter_eval.report import DecisionReport
from amlfilter_eval.study import StudyReport

#: The widest slack any floor may carry, whatever its sample size. Matches the
#: recall harness's own tolerance, for the same reason and to the same number.
PLATFORM_TOLERANCE: Final[float] = 0.02

#: The slack, counted in rows. 40 rows is exactly the absolute slack the recall
#: gate has run stably with (0.02 of its 2,000-query sample), so this is the
#: precedent applied consistently rather than a new number invented here. On a
#: pool of 25,013 pairs it is 0.0016; on 2,000 queries the absolute cap binds
#: first and nothing changes.
TOLERANCE_ROWS: Final[int] = 40

#: Which way a floor is compared. A rate that must not RISE (fpr, fnr) is a
#: ceiling; everything else is a minimum.
Direction = Literal["min", "max"]

#: The metrics gated, and which direction each moves in.
_GATED: Final[tuple[tuple[str, Direction], ...]] = (
    ("precision", "min"),
    ("recall", "min"),
    ("f1", "min"),
    ("fpr", "max"),
    ("fnr", "max"),
)

#: The cells gated: Balanced only, both units, both bands.
_GATED_CELLS: Final[tuple[tuple[str, str], ...]] = (
    ("pair", "alias"),
    ("pair", "canonical"),
    ("pair", "all+hard"),
    ("pair", "all+plain"),
    ("query", "alias+hard"),
    ("query", "alias+plain"),
    ("query", "canonical+hard"),
    ("query", "canonical+plain"),
)

_GATED_LEVEL: Final[str] = "balanced"


class Floor(BaseModel):
    """One gated number: which cell, which metric, which direction, what bound."""

    model_config = ConfigDict(frozen=True)

    unit: str
    pool: str
    band: str
    metric: str
    direction: Direction
    bound: float

    def key(self) -> tuple[str, str, str, str]:
        """What identifies this floor across two baselines."""
        return (self.unit, self.pool, self.band, self.metric)


class GateFailure(BaseModel):
    """One breached floor."""

    model_config = ConfigDict(frozen=True)

    unit: str
    pool: str
    band: str
    metric: str
    direction: Direction
    measured: float
    bound: float

    def describe(self) -> str:
        """One CI-log line."""
        sense = ">=" if self.direction == "min" else "<="
        return (
            f"  {self.unit}/{self.pool}/{self.band} {self.metric}: "
            f"measured {self.measured:.4f}, required {sense} {self.bound:.4f}"
        )


class Baseline(BaseModel):
    """The committed baseline: the measured report, the study, and the floors."""

    model_config = ConfigDict(frozen=True)

    schema_version: Literal[1] = 1
    tolerance: float
    report: DecisionReport
    study: StudyReport
    #: The floors the gate enforces. Every one of them can be breached.
    floors: tuple[Floor, ...]
    #: Metrics pinned at an extreme, recorded rather than gated. See `partition`.
    saturated: tuple[Floor, ...] = ()


def measure(report: DecisionReport, floor: Floor) -> float:
    """The value `floor` gates.

    The ratchet AND the can-fail tests share this predicate. They must: a guard
    proven against a different code path than the one CI runs proves nothing
    about the gate.
    """
    cell = report.cell(floor.unit, floor.pool, _GATED_LEVEL, floor.band)
    value = getattr(cell.scores, floor.metric)
    assert isinstance(value, float)
    return value


def slack(n: int, tolerance: float = PLATFORM_TOLERANCE) -> float:
    """The tolerance for a pool of `n` rows: a row count, capped by a rate.

    See the module docstring for the red run that made this a row count instead
    of a flat rate.
    """
    return tolerance if n <= 0 else min(tolerance, TOLERANCE_ROWS / n)


def _bound(value: float, direction: Direction, tolerance: float) -> float:
    if direction == "min":
        return max(0.0, round(value - tolerance, 4))
    return min(1.0, round(value + tolerance, 4))


def _floor_for(
    report: DecisionReport,
    cell: tuple[str, str],
    band: str,
    metric_direction: tuple[str, Direction],
    tolerance: float,
) -> Floor:
    unit, pool = cell
    metric, direction = metric_direction
    scores = report.cell(unit, pool, _GATED_LEVEL, band).scores
    bound = _bound(getattr(scores, metric), direction, slack(scores.n, tolerance))
    return Floor(
        unit=unit,
        pool=pool,
        band=band,
        metric=metric,
        direction=direction,
        bound=bound,
    )


def floors_from(report: DecisionReport, tolerance: float) -> tuple[Floor, ...]:
    """Derive floors from a measured report. Never called by the gate itself."""
    return tuple(
        _floor_for(report, cell, band, metric_direction, tolerance)
        for cell in _GATED_CELLS
        for band in ("kept", "primary")
        for metric_direction in _GATED
    )


def toothless(floor: Floor) -> bool:
    """True when no measurement could ever breach this floor.

    A minimum of 0.0 is satisfied by every possible value, and a ceiling of 1.0
    likewise: the floor is present, it is green, and it is measuring nothing.
    That is the commonest defect in this portfolio's guards — a check that
    reports success because it cannot report anything else — and the reason it
    keeps surviving review is that a toothless floor looks exactly like a
    passing one. `write` refuses to commit any, so it cannot.
    """
    return (floor.direction == "min" and floor.bound <= 0.0) or (
        floor.direction == "max" and floor.bound >= 1.0
    )


def partition(floors: tuple[Floor, ...]) -> tuple[tuple[Floor, ...], tuple[Floor, ...]]:
    """Split floors into (gated, saturated).

    A saturated floor is not quietly dropped — it is written into the committed
    baseline under its own key, so the artifact says out loud which metrics are
    pinned at an extreme and therefore gate nothing. `query/alias+hard/kept fpr`
    is the live example: every recombined name produces at least one alert at
    Balanced, so its FPR is exactly 1.0 and no regression could raise it. That is
    a finding about the negatives' difficulty, and it belongs in the baseline
    where a reader can see it, not in the floor list where it would read as a
    passing check.
    """
    gated = tuple(f for f in floors if not toothless(f))
    return gated, tuple(f for f in floors if toothless(f))


def assert_has_teeth(floors: tuple[Floor, ...]) -> None:
    """Refuse a floor list carrying anything nothing could breach.

    A postcondition on `partition`'s output, not a check on the live path —
    `partition` has already moved every toothless floor aside by the time this
    runs, so on the shipped path it is defence in depth. It exists so a future
    change to `partition` that stops filtering cannot quietly ship a green
    baseline full of checks that gate nothing.
    """
    blind = [f for f in floors if toothless(f)]
    if blind:
        rendered = "\n".join(
            f"  {f.unit}/{f.pool}/{f.band} {f.metric} {f.direction}={f.bound}" for f in blind
        )
        raise ValueError(
            "refusing to write a baseline with floors nothing could breach — "
            f"these gate nothing:\n{rendered}"
        )


def _newly_saturated(saturated: tuple[Floor, ...], previous: tuple[Floor, ...]) -> list[Floor]:
    known = {floor.key() for floor in previous}
    return [floor for floor in saturated if floor.key() not in known]


def _new_saturation_message(fresh: list[Floor]) -> str:
    rendered = "\n".join(
        f"  {f.unit}/{f.pool}/{f.band} {f.metric} reached {f.bound}" for f in fresh
    )
    return (
        "refusing to write a baseline in which a gated metric newly saturated — "
        "it would silently drop its own gate:\n"
        f"{rendered}\n"
        "Either the decision regressed, or the measurement changed. Argue it in "
        "the pull request and hand-edit the committed baseline; do not re-run the "
        "tool until it looks clean."
    )


def assert_no_new_saturation(
    saturated: tuple[Floor, ...], previous: tuple[Floor, ...] | None
) -> None:
    """Refuse a re-measurement in which a real floor has newly gone toothless.

    `previous` is None only when there is no committed baseline at all — the
    first write, where nothing has been established to regress from. Every write
    after that is compared.

    THIS is the live guard, and it exists because `partition` on its own is a
    silent gate-remover. A metric that degrades all the way to its extreme — an
    FPR climbing to exactly 1.0, say — stops being gateable, moves into
    `saturated`, and the run goes GREEN with one fewer check than it started
    with. The regression removes its own alarm. Nothing about the output would
    look wrong.

    So a re-measurement may keep the saturation it inherited, and may reduce it,
    but may never add to it without a hand edit to the committed baseline. That
    is a visible, arguable diff — the same standard the ratchet holds a lowered
    floor to.
    """
    if previous is None:
        return
    fresh = _newly_saturated(saturated, previous)
    if fresh:
        raise ValueError(_new_saturation_message(fresh))


def _stricter(new: Floor, old: Floor) -> Floor:
    bound = max(new.bound, old.bound) if new.direction == "min" else min(new.bound, old.bound)
    return new.model_copy(update={"bound": bound})


def ratchet(new: tuple[Floor, ...], old: tuple[Floor, ...] | None) -> tuple[Floor, ...]:
    """Keep whichever bound is stricter, so a floor can never be lowered by a re-run."""
    if old is None:
        return new
    previous = {floor.key(): floor for floor in old}
    return tuple(_stricter(f, previous[f.key()]) if f.key() in previous else f for f in new)


def _breach(report: DecisionReport, floor: Floor) -> GateFailure | None:
    measured = measure(report, floor)
    ok = measured >= floor.bound if floor.direction == "min" else measured <= floor.bound
    if ok:
        return None
    return GateFailure(
        unit=floor.unit,
        pool=floor.pool,
        band=floor.band,
        metric=floor.metric,
        direction=floor.direction,
        measured=measured,
        bound=floor.bound,
    )


def check(report: DecisionReport, floors: tuple[Floor, ...]) -> tuple[GateFailure, ...]:
    """Grade a measurement against the committed floors. Empty means it passed."""
    found = (_breach(report, floor) for floor in floors)
    return tuple(f for f in found if f is not None)


def format_failures(failures: tuple[GateFailure, ...]) -> str:
    """Render the breaches for a CI log, one per line."""
    return "\n".join(f.describe() for f in failures)
