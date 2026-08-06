"""The command CI runs, driven end to end against synthetic evidence.

No test here depends on the generated artifacts existing. `cli._measure` reaches
for `.decision-out/` through module-level names, so those names are redirected at
the seam and every command below runs over the eight-query fixture instead. That
is deliberate: a test suite that only passes after someone remembers to run the
TypeScript emitter is a suite that will be skipped.
"""

from __future__ import annotations

import runpy
from pathlib import Path

import pytest

from amlfilter_eval import cli
from amlfilter_eval.artifact import DecisionArtifact, PairStudy, write_json
from amlfilter_eval.gate import PLATFORM_TOLERANCE, Baseline, Floor, floors_from, partition
from amlfilter_eval.report import DecisionReport, build_report
from amlfilter_eval.study import StudyReport, build_study_report
from conftest import (
    alias_queries,
    canonical_queries,
    clean_queries,
    decision_header,
    study_header,
    study_pairs,
)


@pytest.fixture
def synthetic(monkeypatch: pytest.MonkeyPatch) -> tuple[DecisionReport, StudyReport]:
    """Point the CLI's loaders at the fixture and hand back what it will measure."""
    artifact = DecisionArtifact(
        header=decision_header(),
        queries=alias_queries() + canonical_queries() + clean_queries(),
    )
    study = PairStudy(header=study_header(), pairs=study_pairs())
    monkeypatch.setattr(cli, "load_decision", lambda: artifact)
    monkeypatch.setattr(cli, "load_study", lambda: study)
    return build_report(artifact), build_study_report(study)


def _baseline_at(path: Path, report: DecisionReport, study: StudyReport) -> tuple[Floor, ...]:
    """Write a committed baseline whose floors come from `report`."""
    floors, saturated = partition(floors_from(report, PLATFORM_TOLERANCE))
    write_json(
        path,
        Baseline(
            tolerance=PLATFORM_TOLERANCE,
            report=report,
            study=study,
            floors=floors,
            saturated=saturated,
        ),
    )
    return floors


def test_summarize_names_the_collision_verdict(
    synthetic: tuple[DecisionReport, StudyReport],
) -> None:
    """The reading that sets a ceiling on every number must appear in the log.

    A precision quoted without the verdict it assumes is not a number anyone can
    use — the two readings disagree by a factor here.
    """
    text = cli.summarize(*synthetic)
    assert "collisions counted as: false-positive" in text
    assert "corpus 13 entities (aaaaaaaaaaaa), seed 7, 2/segment" in text


def test_summarize_carries_the_typescript_cross_check(
    synthetic: tuple[DecisionReport, StudyReport],
) -> None:
    """The same evidence scored twice, printed side by side with the difference."""
    text = cli.summarize(*synthetic)
    assert "typescript vs assay (the same evidence, scored twice):" in text
    assert "recall@1 " in text
    assert "typescript=0.5000000000  assay=0.5000000000  |diff|=0.00e+00" in text
    assert "typescript=1.0000000000  assay=1.0000000000" in text
    assert text.count("|diff|=0.00e+00") == 4


def test_summarize_carries_the_name_similarity_study(
    synthetic: tuple[DecisionReport, StudyReport],
) -> None:
    """Both rules, with the number that used to live only in a code comment."""
    text = cli.summarize(*synthetic)
    assert "name-similarity study (4 alias pairs, 2 cross-person):" in text
    assert "token_set_ratio>=alias_fuzzy_tier" in text
    assert "shared_double_metaphone_key" in text
    assert "fpr=1.0000" in text


def test_summarize_prints_every_measured_cell(
    synthetic: tuple[DecisionReport, StudyReport],
) -> None:
    """48 cells plus a header row. Lenient and Strict are reported, not gated."""
    lines = cli.summarize(*synthetic).splitlines()
    assert sum(1 for line in lines if line.startswith(("pair  ", "query "))) == 48
    assert any(line.startswith("unit  pool") for line in lines)


def test_write_creates_a_baseline_that_check_then_passes(
    tmp_path: Path,
    synthetic: tuple[DecisionReport, StudyReport],
    capsys: pytest.CaptureFixture[str],
) -> None:
    """The round trip CI depends on: write the floors, then grade against them."""
    path = tmp_path / "baselines" / "decision-baseline.json"
    assert cli.write(path) == 0
    assert "78 floors gated, 2 recorded as saturated" in capsys.readouterr().out
    assert cli.run_check(path) == 0
    assert "decision gate PASSED" in capsys.readouterr().out


def test_write_ratchets_against_what_is_already_committed(
    tmp_path: Path, synthetic: tuple[DecisionReport, StudyReport]
) -> None:
    """A second write cannot lower a bar the first one set.

    The committed floors are hand-raised to something the run cannot clear, then
    `write` re-derives from the same evidence. Every bound must survive — that is
    the whole reason a lowered floor takes a hand edit to the JSON.
    """
    path = tmp_path / "decision-baseline.json"
    cli.write(path)
    committed = cli.read_baseline(path)
    raised = tuple(
        f.model_copy(update={"bound": 0.99 if f.direction == "min" else 0.0})
        for f in committed.floors
    )
    write_json(path, committed.model_copy(update={"floors": raised}))
    cli.write(path)
    after = {f.key(): f.bound for f in cli.read_baseline(path).floors}
    assert all(after[f.key()] == f.bound for f in raised)


def test_write_refuses_a_baseline_whose_floors_gate_nothing(
    tmp_path: Path, synthetic: tuple[DecisionReport, StudyReport], monkeypatch: pytest.MonkeyPatch
) -> None:
    """PROOF THIS REFUSAL CAN FAIL — with a caveat stated out loud.

    In the shipped path `partition` has already moved every toothless floor into
    `saturated`, so `assert_has_teeth` inside `write` is defence in depth and
    cannot fire. Here `partition` is replaced by a pass-through, which is what a
    future edit that "simplified away" the split would look like. The synthetic
    run really does produce two floors pinned at 1.0, and `write` must refuse to
    commit them as gates rather than writing a baseline that cannot go red.
    """

    def no_split(floors: tuple[Floor, ...]) -> tuple[tuple[Floor, ...], tuple[Floor, ...]]:
        return floors, ()

    monkeypatch.setattr(cli, "partition", no_split)
    path = tmp_path / "decision-baseline.json"
    with pytest.raises(ValueError, match="refusing to write a baseline") as raised:
        cli.write(path)
    assert "query/alias+hard/kept fpr max=1.0" in str(raised.value)
    assert not path.exists()


def test_run_check_returns_one_and_prints_the_breach(
    tmp_path: Path,
    synthetic: tuple[DecisionReport, StudyReport],
    capsys: pytest.CaptureFixture[str],
) -> None:
    """PROOF THIS GATE CAN FAIL — the exit code CI reads, and the line it logs.

    The committed floor is moved above what the run measures, which is exactly
    the shape of a real regression: the evidence is unchanged, the bar is not
    cleared. A gate that only ever returned 0 would look identical in CI.
    """
    report, study = synthetic
    floors = _baseline_at(tmp_path / "b.json", report, study)
    path = tmp_path / "breached.json"
    committed = cli.read_baseline(tmp_path / "b.json")
    breached = tuple(
        f.model_copy(update={"bound": 0.99})
        if f.key() == ("pair", "canonical", "kept", "precision")
        else f
        for f in floors
    )
    write_json(path, committed.model_copy(update={"floors": breached}))
    assert cli.run_check(path) == 1
    captured = capsys.readouterr()
    assert "decision gate FAILED — 1 floor(s) breached" in captured.err
    assert "pair/canonical/kept precision: measured 0.5000, required >= 0.9900" in captured.err


def test_run_check_reports_every_breach_at_once(
    tmp_path: Path,
    synthetic: tuple[DecisionReport, StudyReport],
    capsys: pytest.CaptureFixture[str],
) -> None:
    """A regression that moves three numbers must not be reported as one.

    Three minimum floors are raised to 1.0 over cells that measure 0.5 or less,
    so all three genuinely breach. The count in the log and the number of
    rendered lines both have to be three.
    """
    report, study = synthetic
    _baseline_at(tmp_path / "b.json", report, study)
    committed = cli.read_baseline(tmp_path / "b.json")
    targets = {
        ("pair", "canonical", "kept", "precision"),
        ("pair", "canonical", "kept", "recall"),
        ("pair", "canonical", "kept", "f1"),
    }
    breached = tuple(
        f.model_copy(update={"bound": 1.0}) if f.key() in targets else f for f in committed.floors
    )
    path = tmp_path / "three-breached.json"
    write_json(path, committed.model_copy(update={"floors": breached}))
    assert cli.run_check(path) == 1
    err = capsys.readouterr().err
    assert "3 floor(s) breached" in err
    assert err.count("required >= 1.0000") == 3


def test_read_baseline_round_trips_what_write_emitted(
    tmp_path: Path, synthetic: tuple[DecisionReport, StudyReport]
) -> None:
    """The committed artifact is parsed, not trusted — including its own metrics."""
    path = tmp_path / "decision-baseline.json"
    cli.write(path)
    baseline = cli.read_baseline(path)
    assert baseline.schema_version == 1
    assert baseline.tolerance == PLATFORM_TOLERANCE
    assert baseline.report.collision_verdict == "false-positive"
    assert baseline.study.positives == 4
    assert len(baseline.floors) == 78
    assert len(baseline.saturated) == 2


def test_main_defaults_to_check(monkeypatch: pytest.MonkeyPatch) -> None:
    """No argument means `check`, because that is what CI invokes."""
    calls: list[str] = []
    monkeypatch.setattr(cli, "run_check", lambda: calls.append("check") or 0)
    monkeypatch.setattr(cli, "write", lambda: calls.append("write") or 0)
    assert cli.main([]) == 0
    assert calls == ["check"]


def test_main_reads_sys_argv_when_given_none(monkeypatch: pytest.MonkeyPatch) -> None:
    """`python -m amlfilter_eval write` has to reach `write`."""
    calls: list[str] = []
    monkeypatch.setattr(cli, "run_check", lambda: calls.append("check") or 0)
    monkeypatch.setattr(cli, "write", lambda: calls.append("write") or 7)
    monkeypatch.setattr("sys.argv", ["amlfilter_eval", "write"])
    assert cli.main() == 7
    assert calls == ["write"]


def test_main_rejects_an_unknown_command(capsys: pytest.CaptureFixture[str]) -> None:
    """Exit 2, and say what was expected. Never fall through to `check`."""
    assert cli.main(["bogus"]) == 2
    assert "unknown command 'bogus'; expected 'check' or 'write'" in capsys.readouterr().err


def test_python_dash_m_returns_the_cli_exit_code(monkeypatch: pytest.MonkeyPatch) -> None:
    """The entrypoint CI actually invokes, exercised rather than assumed.

    `python -m amlfilter_eval` is the documented command. If `__main__.py`
    swallowed the return value, every breach would exit 0 and the gate would be
    green forever while reporting failures in the log.
    """
    monkeypatch.setattr("sys.argv", ["amlfilter_eval", "bogus"])
    with pytest.raises(SystemExit) as raised:
        runpy.run_module("amlfilter_eval", run_name="__main__")
    assert raised.value.code == 2
