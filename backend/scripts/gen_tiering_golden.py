"""Generate the cross-language tiering parity golden @amlfilter/workstation loads.

Runs the canonical ``aml_filter.scoring.tiers.classify_tier`` over fixed
(score, possible_threshold[, strong]) cases — including the inclusive lower
edges of both bands — and writes the expected tiers as JSON. The TS
``classifyTier`` (a port of ``scoring/tiers.py``) must reproduce every case;
see ``tiering.parity.test.ts``. A ``strong`` of ``null`` asserts the DEFAULT
strong band on both sides.

    backend $ uv run python scripts/gen_tiering_golden.py <out_file>

<out_file> should be the package fixture, e.g.
    ../frontend/packages/amlfilter-workstation/src/__fixtures__/tiering/golden.json
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path

from aml_filter.scoring.tiers import STRONG_TIER_FLOOR, classify_tier


@dataclass(frozen=True)
class Case:
    """One tiering scenario; ``strong=None`` means use the canonical default."""

    name: str
    score: float
    possible_threshold: float
    strong: float | None = None


def _cases() -> list[Case]:
    """The parity scenarios: band interiors, inclusive edges, custom bands."""
    return [
        Case("well above the strong floor", 0.95, 0.65),
        Case("strong lower edge is inclusive", STRONG_TIER_FLOOR, 0.65),
        Case("just below the strong floor", 0.7999999, 0.65),
        Case("possible lower edge is inclusive", 0.65, 0.65),
        Case("just below the possible threshold", 0.6499999, 0.65),
        Case("weak at zero", 0.0, 0.65),
        Case("strict preset possible threshold", 0.76, 0.75),
        Case("lenient preset possible threshold", 0.56, 0.55),
        Case("custom strong band demotes 0.85", 0.85, 0.65, strong=0.9),
        Case("custom strong band lower edge", 0.9, 0.65, strong=0.9),
    ]


def _case_json(case: Case) -> dict[str, object]:
    """One golden case: the inputs plus the canonical expected tier."""
    strong = case.strong if case.strong is not None else STRONG_TIER_FLOOR
    tier = classify_tier(case.score, case.possible_threshold, strong=strong)
    return {
        "name": case.name,
        "score": case.score,
        "possible_threshold": case.possible_threshold,
        "strong": case.strong,
        "expected_tier": tier.value,
    }


def main(out_file: Path) -> None:
    """Write the tiering golden JSON for all parity cases to out_file."""
    cases = [_case_json(c) for c in _cases()]
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(cases, indent=2) + "\n")
    print(f"wrote {len(cases)} tiering parity cases to {out_file}")


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve())
