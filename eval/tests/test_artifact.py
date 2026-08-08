"""The parser: emitted evidence is parsed, and a missing file says why.

The two artifacts are generated and never committed, so the failure a developer
actually hits is "the file is not there". That message has to name the command
that produces it, or the harness looks broken when it is merely unrun.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from amlfilter_eval.artifact import (
    DecisionArtifact,
    PairStudy,
    load_decision,
    load_study,
    write_json,
)
from conftest import alias_queries, decision_header, study_header, study_pairs, write_jsonl


def test_round_trips_the_decision_artifact(artifact: DecisionArtifact) -> None:
    """Eight queries, thirteen candidate rows, in emission order."""
    assert [q.id for q in artifact.queries] == [1, 2, 3, 4, 5, 6, 7, 8]
    assert sum(len(q.candidates) for q in artifact.queries) == 13
    assert artifact.header.corpus.entities == 13
    assert artifact.header.engineVersion == "synthetic-0"


def test_round_trips_a_candidate_exactly(artifact: DecisionArtifact) -> None:
    """The collision row survives the wire unchanged — it drives every verdict test."""
    collision = artifact.queries[0].candidates[1]
    assert collision.entityId == "E2"
    assert collision.expected is False
    assert collision.tokenContainment is True
    assert collision.kept == ("lenient", "balanced")
    assert collision.primary == ("lenient",)
    assert collision.rank == 2


def test_round_trips_the_pair_study(study: PairStudy) -> None:
    """Six pairs, four labelled positive, with the engine's own cut carried along."""
    assert len(study.pairs) == 6
    assert [p.label for p in study.pairs] == [1, 1, 1, 1, 0, 0]
    assert study.header.rules.aliasFuzzySetRatio == 0.6
    assert study.header.positives == 4


def test_missing_file_names_the_command_that_generates_it(tmp_path: Path) -> None:
    """PROOF THIS GUARD CAN FAIL — the hint is asserted, not assumed.

    An artifact that is generated rather than committed WILL be missing on a
    fresh clone. If the error said only "no such file", the reader's next move
    would be to look for a file that is not supposed to exist.
    """
    missing = tmp_path / "nowhere.jsonl"
    with pytest.raises(FileNotFoundError, match="generated, not committed") as raised:
        load_decision(missing)
    assert "gate:decision" in str(raised.value)


def test_missing_study_file_raises_the_same_way(tmp_path: Path) -> None:
    """Both loaders go through the same refusal."""
    with pytest.raises(FileNotFoundError, match="generated, not committed"):
        load_study(tmp_path / "nowhere.jsonl")


def test_empty_file_is_refused_rather_than_scored_as_nothing(tmp_path: Path) -> None:
    """An empty artifact is a broken run, not a run with no findings."""
    empty = tmp_path / "empty.jsonl"
    empty.write_text("", encoding="utf-8")
    with pytest.raises(ValueError, match="is empty"):
        load_decision(empty)


def test_whitespace_only_file_is_also_empty(tmp_path: Path) -> None:
    """Blank lines are stripped, so a file of them carries no rows."""
    blank = tmp_path / "blank.jsonl"
    blank.write_text("\n   \n\n", encoding="utf-8")
    with pytest.raises(ValueError, match="is empty"):
        load_study(blank)


def test_level_returns_the_named_level(artifact: DecisionArtifact) -> None:
    """Balanced is the level the floors gate; its thresholds come from the artifact."""
    balanced = artifact.level("balanced")
    assert balanced.floor == 0.45
    assert balanced.minLexical == 0.4
    assert artifact.level("strict").floor == 0.7


def test_level_raises_on_a_level_the_artifact_does_not_carry(
    tmp_path: Path,
) -> None:
    """PROOF THIS GUARD CAN FAIL — a level list missing `strict` must refuse.

    Rebuilt with only two levels, so the refusal is exercised on an artifact
    that genuinely lacks the level rather than on a typo'd name.
    """
    header = decision_header()
    two = header.model_copy(update={"levels": header.levels[:2]})
    path = write_jsonl(tmp_path / "two-levels.jsonl", two, alias_queries())
    with pytest.raises(ValueError, match=r"carries no 'strict' level"):
        load_decision(path).level("strict")


def test_in_segments_filters_and_preserves_emission_order(
    artifact: DecisionArtifact,
) -> None:
    """Order is the artifact's, not the argument list's.

    `in_segments("canonical", "alias")` must still return queries 1-4 in
    emission order. If it followed the argument order, every pooled measurement
    would be scored over a differently-ordered vector — harmless for the
    metrics, but it would mean the pool is being rebuilt rather than filtered.
    """
    assert [q.id for q in artifact.in_segments("canonical", "alias")] == [1, 2, 3, 4]
    assert [q.id for q in artifact.in_segments("clean-plain")] == [7, 8]
    assert artifact.in_segments("clean-hard", "clean-plain")[0].id == 5


def test_in_segments_returns_empty_for_an_absent_segment(
    positives_only: DecisionArtifact,
) -> None:
    """An artifact with no negatives yields no negative queries, not a KeyError."""
    assert positives_only.in_segments("clean-hard", "clean-plain") == ()


def test_unknown_producer_fields_are_ignored(tmp_path: Path) -> None:
    """`extra="ignore"` is the contract: the emitter may add fields freely."""
    header = json.loads(decision_header().model_dump_json())
    header["somethingNew"] = {"the": "emitter added this"}
    row = json.loads(alias_queries()[0].model_dump_json())
    row["alsoNew"] = 42
    path = tmp_path / "extra.jsonl"
    path.write_text(f"{json.dumps(header)}\n{json.dumps(row)}\n", encoding="utf-8")
    assert load_decision(path).queries[0].id == 1


def test_write_json_emits_a_reviewable_diff(tmp_path: Path) -> None:
    """Indented, newline-terminated — a baseline is read in review, not by a machine."""
    out = tmp_path / "out.json"
    write_json(out, study_header())
    text = out.read_text(encoding="utf-8")
    assert text.endswith("}\n")
    assert '\n  "seed": 7' in text
    assert json.loads(text)["rules"]["aliasFuzzySetRatio"] == 0.6


def test_write_json_round_trips_through_the_model(tmp_path: Path) -> None:
    """What is written parses back as the same model."""
    out = tmp_path / "study.jsonl"
    write_jsonl(out, study_header(), study_pairs())
    assert load_study(out).pairs[4].tokenSet == 0.6
