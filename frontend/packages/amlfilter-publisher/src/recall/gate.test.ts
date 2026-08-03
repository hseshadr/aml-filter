import { describe, expect, it } from "vitest";
import {
	checkRecall,
	floorsFromReport,
	formatFailures,
	type RecallFloors,
} from "./gate.ts";
import {
	formatReport,
	type RecallReport,
	recallAt,
	segmentOf,
} from "./report.ts";

function report(aliasRecall: number, aliasAbsent: number): RecallReport {
	return {
		schemaVersion: 1,
		measuredAt: "2026-08-03T00:00:00.000Z",
		corpus: {
			listId: "OFAC_SDN",
			entities: 19181,
			fixture: "ofac-sdn-corpus.jsonl.gz",
			fixtureSha256: "deadbeef",
		},
		screen: { threshold: 0.3, k: 25 },
		sample: {
			seed: 1,
			perSegment: 100,
			availableAlias: 1000,
			availableCanonical: 1000,
		},
		segments: [
			{
				kind: "alias",
				queries: 100,
				at: [
					{ k: 1, hits: 50, recall: aliasRecall },
					{ k: 10, hits: 60, recall: aliasRecall },
					{ k: 25, hits: 60, recall: aliasRecall },
				],
				absent: Math.round(aliasAbsent * 100),
				absentRate: aliasAbsent,
			},
			{
				kind: "canonical",
				queries: 100,
				at: [
					{ k: 1, hits: 99, recall: 0.99 },
					{ k: 10, hits: 100, recall: 1 },
					{ k: 25, hits: 100, recall: 1 },
				],
				absent: 0,
				absentRate: 0,
			},
		],
	};
}

const FLOORS: RecallFloors = {
	segments: [
		{
			kind: "alias",
			minRecallAt1: 0.5,
			minRecallAt10: 0.5,
			minRecallAt25: 0.5,
			maxAbsentRate: 0.4,
		},
	],
};

describe("checkRecall", () => {
	it("passes when every measured value clears its floor", () => {
		expect(checkRecall(report(0.6, 0.3), FLOORS)).toEqual({
			ok: true,
			failures: [],
		});
	});

	it("passes when a value sits exactly ON the floor", () => {
		expect(checkRecall(report(0.5, 0.4), FLOORS).ok).toBe(true);
	});

	// The gate exists to catch this. A recall drop MUST produce ok:false — a gate
	// nobody has watched fail is not evidence that it can.
	it("FAILS when recall drops below the floor, naming each breach", () => {
		const verdict = checkRecall(report(0.2, 0.3), FLOORS);
		expect(verdict.ok).toBe(false);
		expect(verdict.failures).toHaveLength(3);
		expect(verdict.failures[0]).toEqual({
			segment: "alias",
			metric: "recall@1",
			measured: 0.2,
			floor: 0.5,
		});
	});

	it("FAILS when the absent rate rises above its ceiling", () => {
		const verdict = checkRecall(report(0.6, 0.9), FLOORS);
		expect(verdict.ok).toBe(false);
		expect(verdict.failures).toEqual([
			{
				segment: "alias",
				metric: "absentRate",
				measured: 0.9,
				floor: 0.4,
			},
		]);
	});

	it("throws when the report is missing a segment the floors require", () => {
		const floors: RecallFloors = {
			segments: [
				{
					kind: "canonical",
					minRecallAt1: 0,
					minRecallAt10: 0,
					minRecallAt25: 0,
					maxAbsentRate: 1,
				},
			],
		};
		const missing: RecallReport = { ...report(1, 0), segments: [] };
		expect(() => checkRecall(missing, floors)).toThrow(
			/no "canonical" segment/,
		);
	});

	it("throws when a segment is missing a cut-off the floors require", () => {
		const stripped: RecallReport = {
			...report(1, 0),
			segments: [{ ...segmentOf(report(1, 0), "alias"), at: [] }],
		};
		expect(() => checkRecall(stripped, FLOORS)).toThrow(/no recall@1/);
	});
});

describe("floorsFromReport", () => {
	it("sets each floor one tolerance below the measured value", () => {
		const floors = floorsFromReport(report(0.6123, 0.3), 0.02);
		expect(floors.segments[0]?.minRecallAt1).toBe(0.5923);
	});

	it("raises the absent CEILING by the tolerance rather than lowering it", () => {
		expect(
			floorsFromReport(report(0.6, 0.3), 0.02).segments[0]?.maxAbsentRate,
		).toBe(0.32);
	});

	it("clamps to the [0, 1] range", () => {
		const floors = floorsFromReport(report(0.01, 0.99), 0.05);
		expect(floors.segments[0]?.minRecallAt1).toBe(0);
		expect(floors.segments[0]?.maxAbsentRate).toBe(1);
	});

	it("produces floors the report it came from passes", () => {
		const measured = report(0.6, 0.3);
		expect(checkRecall(measured, floorsFromReport(measured, 0.02)).ok).toBe(
			true,
		);
	});
});

describe("formatting", () => {
	it("names the segment, metric, measured value and floor in a failure line", () => {
		const line = formatFailures(checkRecall(report(0.2, 0.3), FLOORS).failures);
		expect(line).toContain("alias recall@1");
		expect(line).toContain("0.2000");
		expect(line).toContain("0.5000");
	});

	it("renders an empty failure list as an empty string", () => {
		expect(formatFailures([])).toBe("");
	});

	it("renders the corpus, screen params and both segments", () => {
		const text = formatReport(report(0.6, 0.3));
		expect(text).toContain("19181 entities");
		expect(text).toContain("threshold=0.3 k=25");
		expect(text).toContain("alias");
		expect(text).toContain("canonical");
	});
});

describe("recallAt", () => {
	it("reads the recall recorded at a cut-off", () => {
		expect(recallAt(segmentOf(report(0.6, 0.3), "alias"), 10)).toBe(0.6);
	});
});
