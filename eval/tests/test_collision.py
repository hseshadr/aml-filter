"""The one assumption that sets a ceiling on every number this package reports.

`collision.py` decides whether a returned entity that shares a whole token with
the query, but is not the person screened, is a false positive or a true positive
an analyst must review. The two readings do not agree on any precision or FPR in
the baseline. This file pins the truth table for both, so that flipping the
constant is a visible, tested change rather than a quiet re-measurement.
"""

from __future__ import annotations

import pytest

from amlfilter_eval.collision import ALTERNATIVE_VERDICT, COLLISION_VERDICT, is_true_match


def test_committed_verdict_is_the_pessimistic_reading() -> None:
    """OWNER-PENDING ASSUMPTION, pinned against the literal.

    The owner has not ruled. Until they do this package assumes reading (a):
    a name collision is a FALSE POSITIVE. Every precision in the baseline is
    therefore a lower bound and every FPR an upper bound. This assertion exists
    so that flipping the assumption cannot happen without editing a test that
    says out loud what is being flipped.
    """
    assert COLLISION_VERDICT == "false-positive"


def test_the_alternative_is_the_other_reading() -> None:
    """The two named verdicts must be different, or "measure both" measures one."""
    assert ALTERNATIVE_VERDICT == "true-positive-review"
    assert ALTERNATIVE_VERDICT != COLLISION_VERDICT


@pytest.mark.parametrize(
    ("expected", "token_containment", "truth"),
    [
        (True, True, True),
        (True, False, True),
        (False, True, False),
        (False, False, False),
    ],
)
def test_truth_table_under_false_positive(
    expected: bool, token_containment: bool, truth: bool
) -> None:
    """Under the committed reading, only `expected` is a true match."""
    assert (
        is_true_match(
            expected=expected,
            token_containment=token_containment,
            verdict=COLLISION_VERDICT,
        )
        is truth
    )


@pytest.mark.parametrize(
    ("expected", "token_containment", "truth"),
    [
        (True, True, True),
        (True, False, True),
        (False, True, True),
        (False, False, False),
    ],
)
def test_truth_table_under_true_positive_review(
    expected: bool, token_containment: bool, truth: bool
) -> None:
    """Under the alternative reading, a token collision is also a true match."""
    assert (
        is_true_match(
            expected=expected,
            token_containment=token_containment,
            verdict=ALTERNATIVE_VERDICT,
        )
        is truth
    )


def test_the_verdict_changes_exactly_one_cell_of_the_table() -> None:
    """PROOF THIS CONSTANT IS NOT INERT.

    The two readings must disagree somewhere, or `COLLISION_VERDICT` would be a
    knob that turns nothing. They disagree on exactly one input — the collision
    itself — and agree on the other three.
    """
    inputs = [(True, True), (True, False), (False, True), (False, False)]
    disagreements = [
        (expected, token)
        for expected, token in inputs
        if is_true_match(expected=expected, token_containment=token, verdict=COLLISION_VERDICT)
        != is_true_match(expected=expected, token_containment=token, verdict=ALTERNATIVE_VERDICT)
    ]
    assert disagreements == [(False, True)]


def test_no_token_overlap_is_a_false_positive_under_both_readings() -> None:
    """Embedding-neighbourhood noise is never a collision, whichever way it goes."""
    for verdict in (COLLISION_VERDICT, ALTERNATIVE_VERDICT):
        assert not is_true_match(expected=False, token_containment=False, verdict=verdict)
