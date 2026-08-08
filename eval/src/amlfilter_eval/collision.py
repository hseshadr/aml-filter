"""THE OWNER DECISION THIS HARNESS IS WAITING ON.

Read this before quoting any precision or FPR number this package produces. It
sets the ceiling on all of them.

THE QUESTION
A user screens "Mohammed Ali". The engine returns the designation that name
belongs to (a true positive, no argument) and also returns four other
designations that publish a name sharing a whole token with the query — a
different Mohammed, a different Ali. Is each of those four:

  (a) a FALSE POSITIVE — the product alerted on someone who is not the person
      screened; or
  (b) a TRUE POSITIVE a human must review — a genuine name collision against a
      sanctions list, which is exactly what an analyst is employed to disposition
      and which no automated system should be silently dropping?

Both readings are defensible and they are not close: (a) charges the matcher for
every collision, (b) charges it for none. Nothing else in the measurement moves
the numbers as much.

WHAT THIS HARNESS ASSUMES, AND WHY
`COLLISION_VERDICT` is set to FALSE_POSITIVE — reading (a), the pessimistic one.
That is a measurement stance, not a product opinion: reading (b) makes a
collision cost nothing, so a matcher could improve its reported precision by
returning MORE near-name entities, and the metric would applaud a product getting
noisier. A harness must not be able to flatter itself. The conservative reading
is the one that cannot.

The consequence, stated plainly: every precision and FPR in the committed
baseline is a LOWER BOUND on precision and an UPPER BOUND on the false-positive
rate. If the owner rules that collisions are reviewable true positives, flip the
constant below, re-measure, and every number improves. Nothing else changes —
this is the only place the choice is expressed.

THE OWNER HAS NOT RULED. Until they do, treat the reported precision as "how
often an alert was the exact entity screened", not "how often an alert was
useful".

WHAT COUNTS AS A COLLISION
A returned entity that is NOT an acceptable answer for the query, but publishes a
name sharing at least one whole canonical token with it. Whole-token overlap is
not an arbitrary line: it is the exact condition the live lexical gate uses as
its escape hatch (`hasTokenContainment` in the app's strictness.ts), so a
collision here is precisely the population that gate deliberately lets through.

Entities returned with NO token overlap are never collisions under either
reading. They are embedding-neighbourhood noise and count as false positives
whichever way the owner rules.
"""

from __future__ import annotations

from typing import Final, Literal

#: How a name collision is labelled. See the module docstring.
CollisionVerdict = Literal["false-positive", "true-positive-review"]

#: THE ASSUMPTION AWAITING THE OWNER'S RULING. Flip this one line to re-measure
#: under the other reading; nothing else in the package needs to change.
COLLISION_VERDICT: Final[CollisionVerdict] = "false-positive"

#: The other reading, named so a test can measure both without editing the
#: constant (a test that mutated it would leave the committed baseline describing
#: whichever value ran last).
ALTERNATIVE_VERDICT: Final[CollisionVerdict] = "true-positive-review"


def is_true_match(*, expected: bool, token_containment: bool, verdict: CollisionVerdict) -> bool:
    """Ground truth for one (query, entity) pair under one reading of collisions."""
    if expected:
        return True
    return token_containment and verdict == "true-positive-review"
