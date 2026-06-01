// Cross-language scoring parity: the TS scorer (a port of the Python
// DefaultScoringPolicy) must reproduce the Python source-of-truth output —
// score, summary, and every weighted reason (including the plain-language
// description) — byte-for-byte. The golden is emitted by the canonical Python
// scorer (backend/scripts/gen_scoring_golden.py); regenerate it after any
// scoring change on either side.

import { describe, expect, it } from "vitest";
import { type GoldenReason, scoringGolden } from "./fixtures";
import { computeScore, PRESETS } from "./scoring";

// toBeCloseTo needs a number; reason fields are number | string | null.
function asNumber(value: number | string | null): number {
	return typeof value === "number" ? value : Number.NaN;
}

describe("scoring parity — TS port reproduces the Python golden", () => {
	for (const c of scoringGolden()) {
		it(c.name, () => {
			const result = computeScore(c.entity, c.query, PRESETS[c.preset].weights);

			expect(result.score).toBeCloseTo(c.expected.score, 10);
			expect(result.summary).toBe(c.expected.summary);
			expect(result.reasons.length).toBe(c.expected.reasons.length);

			result.reasons.forEach((reason, i) => {
				const expected: GoldenReason | undefined = c.expected.reasons[i];
				expect(expected).toBeDefined();
				if (expected === undefined) {
					return;
				}
				expect(reason.signal).toBe(expected.signal);
				expect(reason.description).toBe(expected.description);
				if (typeof expected.value === "number") {
					expect(asNumber(reason.value)).toBeCloseTo(expected.value, 10);
				} else {
					expect(reason.value).toBe(expected.value);
				}
				expect(asNumber(reason.weight)).toBeCloseTo(expected.weight, 10);
				expect(asNumber(reason.contribution)).toBeCloseTo(
					expected.contribution,
					10,
				);
			});
		});
	}
});
