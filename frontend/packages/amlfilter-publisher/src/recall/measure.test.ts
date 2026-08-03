import { describe, expect, it } from "vitest";
import type { LabelledQuery } from "./labels.ts";
import { measureSegment, rankOfExpected } from "./measure.ts";
import { recallAt } from "./report.ts";

function query(name: string, expected: readonly string[]): LabelledQuery {
	return {
		query: name,
		canonical: name,
		kind: "alias",
		expected: new Set(expected),
	};
}

/** A ranker whose answer for each query is scripted, so recall is checkable. */
function scriptedScreen(
	script: ReadonlyMap<string, readonly string[]>,
): (q: string) => Promise<readonly string[]> {
	return async (q: string) => script.get(q) ?? [];
}

describe("rankOfExpected", () => {
	it("returns the 1-based rank of the first acceptable id", () => {
		expect(rankOfExpected(["a", "b", "c"], new Set(["c"]))).toBe(3);
	});

	it("returns the EARLIEST acceptable id when several are present", () => {
		expect(rankOfExpected(["a", "b", "c"], new Set(["c", "b"]))).toBe(2);
	});

	it("returns null when none of the acceptable ids came back", () => {
		expect(rankOfExpected(["a", "b"], new Set(["z"]))).toBeNull();
	});

	it("returns null for an empty result list", () => {
		expect(rankOfExpected([], new Set(["a"]))).toBeNull();
	});
});

describe("measureSegment", () => {
	it("counts a hit at every cut-off at or above its rank", async () => {
		const report = await measureSegment({
			kind: "alias",
			queries: [query("q1", ["E1"])],
			screen: scriptedScreen(new Map([["q1", ["x", "y", "E1"]]])),
			cutoffs: [1, 10, 25],
		});
		expect(recallAt(report, 1)).toBe(0);
		expect(recallAt(report, 10)).toBe(1);
		expect(recallAt(report, 25)).toBe(1);
		expect(report.absent).toBe(0);
	});

	it("counts a query whose entity never came back as absent", async () => {
		const report = await measureSegment({
			kind: "alias",
			queries: [query("q1", ["E1"]), query("q2", ["E2"])],
			screen: scriptedScreen(
				new Map([
					["q1", ["E1"]],
					["q2", ["other"]],
				]),
			),
			cutoffs: [1, 10, 25],
		});
		expect(report.queries).toBe(2);
		expect(report.absent).toBe(1);
		expect(report.absentRate).toBe(0.5);
		expect(recallAt(report, 25)).toBe(0.5);
	});

	it("counts a result BELOW the cut-off as a miss, not a hit", async () => {
		const ranked = Array.from({ length: 30 }, (_, i) => `filler${i}`);
		ranked[26] = "E1";
		const report = await measureSegment({
			kind: "alias",
			queries: [query("q1", ["E1"])],
			screen: scriptedScreen(new Map([["q1", ranked]])),
			cutoffs: [1, 10, 25],
		});
		expect(recallAt(report, 25)).toBe(0);
		expect(report.absent).toBe(0);
	});

	it("reports zeros rather than dividing by zero on an empty segment", async () => {
		const report = await measureSegment({
			kind: "canonical",
			queries: [],
			screen: scriptedScreen(new Map()),
			cutoffs: [1],
		});
		expect(report.queries).toBe(0);
		expect(report.absentRate).toBe(0);
		expect(recallAt(report, 1)).toBe(0);
	});

	it("reports progress for every query", async () => {
		const seen: number[] = [];
		await measureSegment({
			kind: "alias",
			queries: [query("q1", ["E1"]), query("q2", ["E2"])],
			screen: scriptedScreen(new Map()),
			cutoffs: [1],
			onProgress: (done) => seen.push(done),
		});
		expect(seen).toEqual([1, 2]);
	});
});
