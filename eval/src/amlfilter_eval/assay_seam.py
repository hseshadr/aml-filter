"""The metrics seam: every number in this package comes out of `assay`.

WHY THIS FILE EXISTS
aml-filter has measured retrieval recall for months and has never measured the
DECISION. Recall@k answers "did the sanctioned entity appear in the list"; it
cannot answer "did we alert on someone we should not have" or "how often did we
show nothing at all for a real match". Those are precision, FPR and FNR, and
until this file existed there was no false-positive or false-negative rate
anywhere in the repository.

WHY THE ARITHMETIC IS NOT OURS
One rule in two languages will diverge. The TypeScript side owns PRODUCING the
evidence — it drives the real engine over the frozen corpus and records what the
user would have been shown. This module owns SCORING it, and the arithmetic is
scikit-learn's, reached through `assay.metrics`. Nothing here reimplements a
metric.

THE SEAM RULE (inject, don't entangle)
`assay` is imported HERE and nowhere else in this package. Upgrading, renaming or
swapping the metrics engine touches this one file.

HOW FPR AND FNR ARE OBTAINED WITHOUT HAND-ROLLING A CONFUSION MATRIX
`assay.metrics.binary_scores` returns accuracy, precision, recall, F1, PR-AUC and
ROC-AUC — no FPR, no FNR. Rather than count TP/FP/TN/FN by hand (which is exactly
the metric arithmetic this file exists to avoid owning), the seam calls assay a
SECOND time with the labels and predictions inverted. Recall of the inverted
problem is the true-negative rate, so:

    FPR = 1 - recall(inverted)      FNR = 1 - recall(as-is)

Both subtractions are definitional identities on a number assay computed. Checked
against `sklearn.metrics.confusion_matrix` in tests/test_assay_seam.py, which is
what makes "definitional" a fact rather than a claim.
"""

from __future__ import annotations

from collections.abc import Sequence

from assay.metrics import ClassificationScores, binary_scores
from pydantic import BaseModel, ConfigDict

#: Predictions reaching this seam are already hard 0/1 decisions — the live
#: screening rule is a compound gate (score floor AND a lexical test OR a token
#: test), not a single cut point, so there is no continuous score to threshold.
#: 0.5 splits 0.0 from 1.0 and does nothing else.
_HARD = 0.5


class BinaryReport(BaseModel):
    """One decision measured against ground truth. Every field is assay's."""

    model_config = ConfigDict(frozen=True)

    #: Rows scored.
    n: int
    #: Rows whose ground truth is "this is a real match".
    positives: int
    #: Rows the product actually alerted on.
    alerted: int
    precision: float
    recall: float
    f1: float
    accuracy: float
    #: Of the rows that are NOT real matches, the share alerted on.
    fpr: float
    #: Of the rows that ARE real matches, the share not alerted on.
    fnr: float


class Discrimination(BaseModel):
    """Threshold-free separation: how well the raw score orders the labels."""

    model_config = ConfigDict(frozen=True)

    roc_auc: float
    pr_auc: float


def _refuse_single_class(y_true: Sequence[int]) -> None:
    """A metric over one class only is not a measurement; refuse rather than score.

    A precision of 0.0 on an all-negative set reads as "the matcher is broken"
    when it means "the question was unanswerable". Assay refuses this too; the
    message here names which of ours it was.
    """
    if len(set(y_true)) < 2:
        raise ValueError(
            f"cannot score a single-class set (n={len(y_true)}, "
            f"positives={sum(y_true)}); pool it with the opposite segment"
        )


def _scores(y_true: Sequence[int], y_pred: Sequence[int]) -> ClassificationScores:
    return binary_scores(y_true, [float(p) for p in y_pred], threshold=_HARD)


def _inverted(y_true: Sequence[int], y_pred: Sequence[int]) -> ClassificationScores:
    """The same problem with the negative class as the positive one."""
    return binary_scores([1 - t for t in y_true], [1.0 - float(p) for p in y_pred], threshold=_HARD)


def binary_report(y_true: Sequence[int], y_pred: Sequence[int]) -> BinaryReport:
    """Score one hard decision. Precision/recall/F1/accuracy from assay directly."""
    _refuse_single_class(y_true)
    scores = _scores(y_true, y_pred)
    return BinaryReport(
        n=len(y_true),
        positives=sum(y_true),
        alerted=sum(y_pred),
        precision=scores.precision,
        recall=scores.recall,
        f1=scores.f1,
        accuracy=scores.accuracy,
        fpr=1.0 - _inverted(y_true, y_pred).recall,
        fnr=1.0 - scores.recall,
    )


def discrimination(y_true: Sequence[int], y_score: Sequence[float]) -> Discrimination:
    """How well the raw combined score separates matches from non-matches.

    Threshold-free, so it is the one number a threshold change cannot flatter: a
    tuning move that trades FPR for FNR leaves this where it was, while a real
    improvement in the matcher raises it.
    """
    _refuse_single_class(y_true)
    scores = binary_scores(y_true, list(y_score), threshold=_HARD)
    return Discrimination(roc_auc=scores.roc_auc, pr_auc=scores.pr_auc)
