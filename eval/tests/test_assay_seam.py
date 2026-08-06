"""The seam that owns every number in this package, checked against sklearn.

WHY THIS FILE MATTERS MOST
`assay_seam.py` does not compute FPR or FNR. It calls assay twice — once as-is,
once with labels and predictions inverted — and subtracts. Its docstring calls
those subtractions "definitional identities". A docstring is not evidence. This
file recomputes both rates from `sklearn.metrics.confusion_matrix`, which is the
reference the whole field checks against, and asserts agreement to 1e-12 over
several seeded vectors. That is what turns "definitional" into a fact.

Nothing here re-derives a value from the function that produced it. Every
expected number is either a literal counted from a confusion matrix written out
by hand, or sklearn's own answer to the same question.
"""

from __future__ import annotations

import random

import pytest
from sklearn.metrics import confusion_matrix

from amlfilter_eval.assay_seam import binary_report, discrimination

#: A fixed vector whose four confusion-matrix counts are all different, so a
#: transposed or swapped metric cannot slip through looking correct.
#: TP=3, FN=1, FP=2, TN=4.
FIXED_TRUE = [1, 1, 1, 1, 0, 0, 0, 0, 0, 0]
FIXED_PRED = [1, 1, 1, 0, 1, 1, 0, 0, 0, 0]


def _seeded(seed: int, n: int) -> tuple[list[int], list[int]]:
    """A random label/prediction pair guaranteed to carry both classes."""
    rng = random.Random(seed)  # noqa: S311 — test vectors, seeded for reproducibility
    y_true = [rng.randint(0, 1) for _ in range(n)]
    y_pred = [rng.randint(0, 1) for _ in range(n)]
    y_true[0], y_true[1] = 0, 1
    return y_true, y_pred


def _sklearn_rates(y_true: list[int], y_pred: list[int]) -> tuple[float, float]:
    """(fpr, fnr) straight off sklearn's confusion matrix."""
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    return float(fp) / float(fp + tn), float(fn) / float(fn + tp)


@pytest.mark.parametrize("seed", [1, 17, 2026, 90210])
def test_inverted_call_reproduces_sklearn_fpr_and_fnr(seed: int) -> None:
    """The inverted-call trick is a FACT, not a claim in a docstring.

    `binary_report` obtains FPR as `1 - recall(inverted problem)` rather than
    counting TP/FP/TN/FN itself. If that identity were wrong — an off-by-one in
    the inversion, a threshold that rounds the wrong way — this comparison
    against sklearn's confusion matrix is what catches it.
    """
    y_true, y_pred = _seeded(seed, 200)
    report = binary_report(y_true, y_pred)
    expected_fpr, expected_fnr = _sklearn_rates(y_true, y_pred)
    assert report.fpr == pytest.approx(expected_fpr, abs=1e-12)
    assert report.fnr == pytest.approx(expected_fnr, abs=1e-12)


def test_the_sklearn_cross_check_can_disagree() -> None:
    """PROOF THIS GATE CAN FAIL — the comparison above is not vacuous.

    FPR and FNR are different quantities on this vector, and neither equals the
    plausible-but-wrong alternatives (1 - precision, or fp/(fp+fn)). A seam that
    returned any of those instead would be caught by the test above.
    """
    report = binary_report(FIXED_TRUE, FIXED_PRED)
    fpr, fnr = _sklearn_rates(FIXED_TRUE, FIXED_PRED)
    assert fpr != fnr
    assert report.fpr != pytest.approx(1.0 - report.precision)
    assert report.fpr != pytest.approx(2 / (2 + 1))  # fp/(fp+fn), the wrong denominator


def test_hand_counted_confusion_matrix() -> None:
    """Every headline number pinned as a literal, counted on paper.

    TP=3 FN=1 FP=2 TN=4 over 10 rows: precision 3/5, recall 3/4, F1 2/3,
    accuracy 7/10, FPR 2/6, FNR 1/4. None of these is re-derived from the
    function that produced it.
    """
    report = binary_report(FIXED_TRUE, FIXED_PRED)
    assert report.n == 10
    assert report.positives == 4
    assert report.alerted == 5
    assert report.precision == pytest.approx(0.6)
    assert report.recall == pytest.approx(0.75)
    assert report.f1 == pytest.approx(2 / 3)
    assert report.accuracy == pytest.approx(0.7)
    assert report.fpr == pytest.approx(1 / 3)
    assert report.fnr == pytest.approx(0.25)


def test_binary_report_refuses_a_single_class_set() -> None:
    """A metric over one class is not a measurement — and the message says which."""
    with pytest.raises(ValueError, match=r"single-class set \(n=4, positives=4\)") as raised:
        binary_report([1, 1, 1, 1], [1, 0, 1, 0])
    assert "pool it with the opposite segment" in str(raised.value)


def test_binary_report_refuses_all_negative_too() -> None:
    """The all-negative case is the one that would otherwise read as "broken"."""
    with pytest.raises(ValueError, match=r"n=3, positives=0"):
        binary_report([0, 0, 0], [1, 0, 0])


def test_discrimination_refuses_a_single_class_set() -> None:
    """Threshold-free separation needs two classes for the same reason."""
    with pytest.raises(ValueError, match=r"single-class set \(n=3, positives=3\)"):
        discrimination([1, 1, 1], [0.9, 0.5, 0.1])


def test_perfect_ordering_is_one_and_reversed_ordering_is_zero() -> None:
    """ROC-AUC reads the ORDER, so reversing the scores must invert the answer.

    A separation number that stayed high on a reversed ordering would be reading
    magnitude rather than rank, which is the failure this pins shut.
    """
    labels = [0, 0, 1, 1]
    assert discrimination(labels, [0.1, 0.2, 0.8, 0.9]).roc_auc == pytest.approx(1.0)
    assert discrimination(labels, [0.9, 0.8, 0.2, 0.1]).roc_auc == pytest.approx(0.0)


def test_perfect_ordering_gives_pr_auc_one() -> None:
    """PR-AUC saturates on a perfect ordering; it is the other reported number."""
    assert discrimination([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9]).pr_auc == pytest.approx(1.0)


def test_alerting_on_nothing_scores_zero_rather_than_crashing() -> None:
    """A matcher that shows nothing must report precision 0.0, not raise.

    sklearn's zero_division would otherwise make this a divide-by-zero. The
    interesting half is FPR: alerting on nothing means no false positives at
    all, so FPR is 0.0 while FNR is 1.0 — the two must not move together.
    """
    report = binary_report([1, 1, 0, 0], [0, 0, 0, 0])
    assert report.precision == 0.0
    assert report.recall == 0.0
    assert report.f1 == 0.0
    assert report.fnr == 1.0
    assert report.fpr == 0.0
    assert report.alerted == 0


def test_alerting_on_everything_is_the_mirror_image() -> None:
    """Alert on all rows: recall 1.0, FNR 0.0, FPR 1.0. The other extreme."""
    report = binary_report([1, 1, 0, 0], [1, 1, 1, 1])
    assert report.recall == 1.0
    assert report.fnr == 0.0
    assert report.fpr == 1.0
    assert report.precision == pytest.approx(0.5)


def test_report_is_frozen() -> None:
    """A measured number is evidence; nothing downstream may edit it in place."""
    report = binary_report(FIXED_TRUE, FIXED_PRED)
    with pytest.raises(ValueError, match="frozen"):
        report.precision = 1.0
