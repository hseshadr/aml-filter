// Scoring regression guard: the TS scorer is the source of truth for the
// screening score. The golden under __fixtures__/scoring is a FROZEN, committed
// regression snapshot of that scorer's full output — score, summary, and every
// weighted reason (including the plain-language description). This test asserts
// the live scorer still reproduces the committed snapshot byte-for-byte, so any
// unintended drift in score, reason set, or descriptions fails CI.

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
