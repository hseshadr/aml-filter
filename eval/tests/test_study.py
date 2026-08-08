"""The name-similarity study: the number that used to live in a code comment.

`engine/scoring.ts` cites a recall and an FPR for the token_set tier and for the
shared-phonetic-key rule. The script that produced them was never committed, so
until this module existed the citation could not be checked by anyone. These
tests pin both rules over a six-pair fixture whose confusion matrices are counted
by hand, so the arithmetic behind the citable number is itself citable.
"""

from __future__ import annotations

import pytest

from amlfilter_eval.artifact import PairStudy
from amlfilter_eval.study import PHONETIC_RULE, TOKEN_SET_RULE, build_study_report


def test_header_facts_are_carried_through(study: PairStudy) -> None:
    """The report names the population it measured, or the rates mean nothing."""
    report = build_study_report(study)
    assert report.measured_at == "2026-01-01T00:00:00.000Z"
    assert report.positives == 4
    assert report.negatives == 2
    assert [r.rule for r in report.rules] == [TOKEN_SET_RULE, PHONETIC_RULE]


def test_token_set_rule_is_hand_counted(study: PairStudy) -> None:
    """token_set >= 0.60 fires on pairs 1, 2 and 5: TP=2 FN=2 FP=1 TN=1.

    Precision 2/3, recall 1/2, F1 4/7, accuracy 1/2, FPR 1/2, FNR 1/2 — every
    one a literal, none re-derived from the function that produced it.
    """
    scores = build_study_report(study).rule(TOKEN_SET_RULE).scores
    assert (scores.n, scores.positives, scores.alerted) == (6, 4, 3)
    assert scores.precision == pytest.approx(2 / 3)
    assert scores.recall == pytest.approx(0.5)
    assert scores.f1 == pytest.approx(4 / 7)
    assert scores.accuracy == pytest.approx(0.5)
    assert scores.fpr == pytest.approx(0.5)
    assert scores.fnr == pytest.approx(0.5)


def test_the_cut_is_inclusive(study: PairStudy) -> None:
    """Pair 5 sits EXACTLY on aliasFuzzySetRatio and must be alerted on.

    The engine's tier is `>=`, so the boundary pair counts. If the comparison
    were `>` this fixture would report 2 alerts instead of 3 and the FPR would
    read 0.0 — a rule that looks strictly better because it stopped firing.
    """
    cut = study.header.rules.aliasFuzzySetRatio
    assert study.pairs[4].tokenSet == cut
    assert build_study_report(study).rule(TOKEN_SET_RULE).scores.alerted == 3


def test_phonetic_rule_is_hand_counted(study: PairStudy) -> None:
    """A shared Double Metaphone key fires on pairs 1, 3, 5, 6: TP=2 FP=2 TN=0.

    Precision 1/2, recall 1/2, FPR 1.0 — it catches a positive token_set misses
    (pair 3) and pays for it with both negatives.
    """
    scores = build_study_report(study).rule(PHONETIC_RULE).scores
    assert (scores.n, scores.positives, scores.alerted) == (6, 4, 4)
    assert scores.precision == pytest.approx(0.5)
    assert scores.recall == pytest.approx(0.5)
    assert scores.f1 == pytest.approx(0.5)
    assert scores.accuracy == pytest.approx(1 / 3)
    assert scores.fpr == pytest.approx(1.0)
    assert scores.fnr == pytest.approx(0.5)


def test_the_two_rules_do_not_report_the_same_numbers(study: PairStudy) -> None:
    """PROOF BOTH RULES ARE SCORED — not one number printed under two names."""
    report = build_study_report(study)
    token = report.rule(TOKEN_SET_RULE).scores
    phonetic = report.rule(PHONETIC_RULE).scores
    assert token.precision != phonetic.precision
    assert token.fpr != phonetic.fpr
    assert token.recall == phonetic.recall


def test_rule_raises_on_an_unknown_rule(study: PairStudy) -> None:
    """PROOF THIS GUARD CAN FAIL — a missing rule is a broken report, not a zero."""
    with pytest.raises(ValueError, match=r"no 'jaro_winkler' rule"):
        build_study_report(study).rule("jaro_winkler")


def test_the_cut_comes_from_the_artifact_not_from_python(study: PairStudy) -> None:
    """The engine constant travels with the evidence, so it cannot drift.

    Raise the cut carried by the header and the rule fires less. If Python held
    its own copy of `aliasFuzzySetRatio`, this number would keep reporting the
    old tier after the TypeScript changed — one rule in two languages diverging,
    with only the rendered number to show it.
    """
    rules = study.header.rules.model_copy(update={"aliasFuzzySetRatio": 0.8})
    header = study.header.model_copy(update={"rules": rules})
    stricter = study.model_copy(update={"header": header})
    assert build_study_report(stricter).rule(TOKEN_SET_RULE).scores.alerted == 1


def test_a_single_class_study_is_refused_outright(study: PairStudy) -> None:
    """No negatives means no FPR. The seam refuses rather than reporting 0.0."""
    positives = tuple(p for p in study.pairs if p.label == 1)
    with pytest.raises(ValueError, match=r"single-class set \(n=4, positives=4\)"):
        build_study_report(study.model_copy(update={"pairs": positives}))
