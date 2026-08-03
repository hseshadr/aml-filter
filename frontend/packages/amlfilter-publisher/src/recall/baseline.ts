// The committed recall baseline: the measured report plus the floors derived
// from it. One file, so a pull request that changes recall shows the number and
// the floor moving together, in the same diff.

import { readFileSync, writeFileSync } from "node:fs";
import { floorsFromReport, type RecallFloors } from "./gate.ts";
import type { RecallReport } from "./report.ts";

/**
 * How far below a measured value its floor sits. Sized to cover quantized-ONNX
 * rank churn between CPU architectures (see gate.ts), not to buy headroom: at
 * the gate's sample size one percentage point is a handful of queries.
 */
export const PLATFORM_TOLERANCE = 0.02;

/** The committed baseline document. */
export interface RecallBaseline {
	readonly schemaVersion: 1;
	/** Subtracted from each measured value to produce the floors. */
	readonly tolerance: number;
	readonly report: RecallReport;
	readonly floors: RecallFloors;
}

function assertBaseline(value: unknown): asserts value is RecallBaseline {
	const record = value as Partial<RecallBaseline>;
	if (record.schemaVersion !== 1) {
		throw new Error("recall baseline: unsupported or missing schemaVersion");
	}
	if (record.report === undefined || record.floors === undefined) {
		throw new Error("recall baseline: missing report or floors");
	}
	if (typeof record.tolerance !== "number") {
		throw new Error("recall baseline: missing tolerance");
	}
}

/** Read and validate the committed baseline. */
export function readBaseline(path: string): RecallBaseline {
	const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
	assertBaseline(parsed);
	return parsed;
}

/** Build a baseline document from a fresh measurement. */
export function baselineFromReport(
	report: RecallReport,
	tolerance: number,
): RecallBaseline {
	return {
		schemaVersion: 1,
		tolerance,
		report,
		floors: floorsFromReport(report, tolerance),
	};
}

/** Write a baseline as pretty JSON with a trailing newline. */
export function writeBaseline(path: string, baseline: RecallBaseline): void {
	writeFileSync(path, `${JSON.stringify(baseline, null, "\t")}\n`);
}
