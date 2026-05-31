import { describe, expect, it } from "vitest";
import { sequenceRatio } from "./sequenceMatcher";

// Reference values from Python difflib.SequenceMatcher(None, a, b).ratio() —
// the exact function the backend bundle path uses for `name_trigram`.
describe("sequenceRatio matches Python difflib.SequenceMatcher.ratio()", () => {
	const cases: ReadonlyArray<readonly [string, string, number]> = [
		["vladimir ivanov", "vladimir ivanov", 1.0],
		["vladimir ivanov", "boris petrov", 0.296296],
		["acme", "acme holdings", 0.470588],
		["", "", 1.0],
		["abc", "abd", 0.666667],
	];

	for (const [a, b, expected] of cases) {
		it(`ratio(${JSON.stringify(a)}, ${JSON.stringify(b)}) == ${expected}`, () => {
			expect(sequenceRatio(a, b)).toBeCloseTo(expected, 6);
		});
	}

	it("is symmetric for these inputs", () => {
		expect(sequenceRatio("acme holdings", "acme")).toBeCloseTo(0.470588, 6);
	});
});
