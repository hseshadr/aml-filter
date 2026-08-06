"""The decision gate's command line.

    uv run python -m amlfilter_eval check
        Score the emitted artifacts, compare against the committed floors, print
        the table, exit 1 on any breach. This is what CI runs.

    uv run python -m amlfilter_eval write
        Re-measure and rewrite eval/baselines/decision-baseline.json. Use when a
        change is expected to move the numbers; the diff is the evidence. Floors
        ratchet — see gate.py.

Both read the GENERATED artifacts under
frontend/packages/amlfilter-publisher/.decision-out/, which the emitter writes.
`pnpm --filter @amlfilter/publisher run gate:decision` runs the emitter and then
`check`, in one command, so the numbers always describe the tree they are grading.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Final

from amlfilter_eval.artifact import load_decision, load_study, write_json
from amlfilter_eval.gate import (
    PLATFORM_TOLERANCE,
    Baseline,
    Floor,
    assert_has_teeth,
    assert_no_new_saturation,
    check,
    floors_from,
    format_failures,
    partition,
    ratchet,
)
from amlfilter_eval.report import DecisionReport, build_report
from amlfilter_eval.study import StudyReport, build_study_report

#: `src/amlfilter_eval/cli.py` -> `eval/`.
_EVAL_ROOT: Final[Path] = Path(__file__).resolve().parents[2]

#: The committed baseline: the measured metrics and the floors derived from them.
BASELINE_PATH: Final[Path] = _EVAL_ROOT / "baselines" / "decision-baseline.json"


def read_baseline(path: Path = BASELINE_PATH) -> Baseline:
    """Parse the committed baseline, refusing any shape it does not recognise."""
    return Baseline.model_validate_json(path.read_text(encoding="utf-8"))


def _measure() -> tuple[DecisionReport, StudyReport]:
    return build_report(load_decision()), build_study_report(load_study())


def _existing_floors(path: Path) -> tuple[Floor, ...] | None:
    return read_baseline(path).floors if path.exists() else None


def _existing_saturated(path: Path) -> tuple[Floor, ...] | None:
    """The committed saturated set, or None when there is no baseline yet."""
    return read_baseline(path).saturated if path.exists() else None


_HEAD = (
    f"{'unit':<6}{'pool':<17}{'level':<10}{'band':<9}"
    f"{'prec':>8}{'rec':>8}{'f1':>8}{'fpr':>8}{'fnr':>8}{'n':>9}"
)


def _format_cells(report: DecisionReport) -> str:
    head = _HEAD
    rows = [
        f"{m.unit:<6}{m.pool:<17}{m.level:<10}{m.band:<9}"
        f"{m.scores.precision:>8.4f}{m.scores.recall:>8.4f}{m.scores.f1:>8.4f}"
        f"{m.scores.fpr:>8.4f}{m.scores.fnr:>8.4f}{m.scores.n:>9}"
        for m in report.measurements
    ]
    return "\n".join([head, *rows])


def _format_study(study: StudyReport) -> str:
    rows = [
        f"  {r.rule:<40} recall={r.scores.recall:.4f}  fpr={r.scores.fpr:.4f}  "
        f"precision={r.scores.precision:.4f}"
        for r in study.rules
    ]
    title = (
        f"name-similarity study ({study.positives} alias pairs, {study.negatives} cross-person):"
    )
    return "\n".join([title, *rows])


def _format_recall_check(report: DecisionReport) -> str:
    rows = [
        f"  {c.segment:<10} recall@{c.k:<3} typescript={c.ts_recall:.10f}  "
        f"assay={c.assay_recall:.10f}  |diff|={c.abs_diff:.2e}"
        for c in report.recall_checks
    ]
    return "\n".join(["typescript vs assay (the same evidence, scored twice):", *rows])


def summarize(report: DecisionReport, study: StudyReport) -> str:
    """The whole run, rendered for a CI log."""
    return "\n\n".join(
        [
            f"corpus {report.entities} entities ({report.fixture_sha256[:12]}), "
            f"seed {report.seed}, {report.per_segment}/segment, "
            f"collisions counted as: {report.collision_verdict}",
            _format_cells(report),
            _format_study(study),
            _format_recall_check(report),
        ]
    )


def write(path: Path = BASELINE_PATH) -> int:
    """Re-measure and rewrite the committed baseline, ratcheting the floors."""
    report, study = _measure()
    print(summarize(report, study))
    measured = ratchet(floors_from(report, PLATFORM_TOLERANCE), _existing_floors(path))
    floors, saturated = partition(measured)
    assert_no_new_saturation(saturated, _existing_saturated(path))
    assert_has_teeth(floors)
    baseline = Baseline(
        tolerance=PLATFORM_TOLERANCE,
        report=report,
        study=study,
        floors=floors,
        saturated=saturated,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    write_json(path, baseline)
    print(
        f"\nwrote baseline: {path}\n"
        f"  {len(floors)} floors gated, {len(saturated)} recorded as saturated "
        "(pinned at an extreme, so they gate nothing — see gate.partition)"
    )
    return 0


def run_check(path: Path = BASELINE_PATH) -> int:
    """Score the emitted run against the committed floors."""
    report, study = _measure()
    print(summarize(report, study))
    failures = check(report, read_baseline(path).floors)
    if not failures:
        print("\ndecision gate PASSED — every gated metric is inside its floor")
        return 0
    print(
        f"\ndecision gate FAILED — {len(failures)} floor(s) breached:\n{format_failures(failures)}",
        file=sys.stderr,
    )
    return 1


def main(argv: list[str] | None = None) -> int:
    """Dispatch `check` (the default) or `write`."""
    args = sys.argv[1:] if argv is None else argv
    command = args[0] if args else "check"
    if command == "write":
        return write()
    if command == "check":
        return run_check()
    print(f"unknown command {command!r}; expected 'check' or 'write'", file=sys.stderr)
    return 2
