import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	baselineFromReport,
	PLATFORM_TOLERANCE,
	readBaseline,
	writeBaseline,
} from "./baseline.ts";
import { checkRecall } from "./gate.ts";
import { CORPUS_FIXTURE, RECALL_BASELINE } from "./paths.ts";
import type { RecallReport } from "./report.ts";

const REPORT: RecallReport = {
	schemaVersion: 1,
	measuredAt: "2026-08-03T00:00:00.000Z",
	corpus: {
		listId: "OFAC_SDN",
		entities: 19181,
		fixture: "ofac-sdn-corpus.jsonl.gz",
		fixtureSha256: "abc",
	},
	screen: { threshold: 0.3, k: 25 },
	sample: {
		seed: 1,
		perSegment: 100,
		availableAlias: 1,
		availableCanonical: 1,
	},
	segments: [
		{
			kind: "alias",
			queries: 100,
			at: [
				{ k: 1, hits: 55, recall: 0.55 },
				{ k: 10, hits: 61, recall: 0.61 },
				{ k: 25, hits: 61, recall: 0.61 },
			],
			absent: 39,
			absentRate: 0.39,
		},
	],
};

function tempPath(): string {
	return join(mkdtempSync(join(tmpdir(), "baseline-")), "recall-baseline.json");
}

describe("baseline round-trip", () => {
	it("writes and reads back an equal document", () => {
		const path = tempPath();
		const baseline = baselineFromReport(REPORT, PLATFORM_TOLERANCE);
		writeBaseline(path, baseline);
		expect(readBaseline(path)).toEqual(baseline);
	});

	it("writes tab-indented JSON ending in a newline, so the diff is readable", () => {
		const path = tempPath();
		writeBaseline(path, baselineFromReport(REPORT, PLATFORM_TOLERANCE));
		const text = readFileSync(path, "utf8");
		expect(text.endsWith("}\n")).toBe(true);
		expect(text).toContain('\n\t"tolerance"');
	});

	it("derives floors the measurement it came from passes", () => {
		const baseline = baselineFromReport(REPORT, PLATFORM_TOLERANCE);
		expect(checkRecall(REPORT, baseline.floors).ok).toBe(true);
	});

	it("records the tolerance it used", () => {
		expect(baselineFromReport(REPORT, 0.05).tolerance).toBe(0.05);
	});
});

describe("readBaseline fails closed", () => {
	function badBaseline(value: unknown): string {
		const path = tempPath();
		writeFileSync(path, JSON.stringify(value));
		return path;
	}

	it("REJECTS a document with no schemaVersion", () => {
		expect(() => readBaseline(badBaseline({ report: {}, floors: {} }))).toThrow(
			/schemaVersion/,
		);
	});

	it("REJECTS a future schemaVersion", () => {
		expect(() =>
			readBaseline(badBaseline({ schemaVersion: 2, report: {}, floors: {} })),
		).toThrow(/schemaVersion/);
	});

	it("REJECTS a document missing its floors", () => {
		expect(() =>
			readBaseline(badBaseline({ schemaVersion: 1, report: {}, tolerance: 0 })),
		).toThrow(/missing report or floors/);
	});

	it("REJECTS a document missing its tolerance", () => {
		expect(() =>
			readBaseline(badBaseline({ schemaVersion: 1, report: {}, floors: {} })),
		).toThrow(/missing tolerance/);
	});
});

// The committed artifacts are what CI actually gates on. If either goes missing
// or stops parsing, the gate would fail with an IO error rather than a recall
// number — catch that here, where the message is clear.
describe("the committed recall artifacts", () => {
	it("has a corpus fixture on disk", () => {
		expect(readFileSync(CORPUS_FIXTURE).byteLength).toBeGreaterThan(1000);
	});

	it("has a baseline that parses and carries floors for both segments", () => {
		const baseline = readBaseline(RECALL_BASELINE);
		expect(baseline.floors.segments.map((s) => s.kind).sort()).toEqual([
			"alias",
			"canonical",
		]);
	});

	it("has a baseline whose own report passes its own floors", () => {
		const baseline = readBaseline(RECALL_BASELINE);
		expect(checkRecall(baseline.report, baseline.floors).ok).toBe(true);
	});
});
