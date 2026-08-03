// The recall harness CLI — and, with no arguments, the CI gate.
//
//   pnpm --filter @amlfilter/publisher run gate:recall
//       Measure with the baseline's own seed and sample size, compare against
//       the committed floors, exit 1 on any breach.
//
//   pnpm --filter @amlfilter/publisher run measure-recall -- --full
//       Measure EVERY labelled query (all alias variants and all canonical
//       names). Slower; this is the headline number, not the per-PR gate.
//
//   pnpm --filter @amlfilter/publisher run measure-recall -- --write
//       Re-measure and rewrite the committed baseline. Use when a change is
//       expected to move recall; the diff is the evidence.

import { parseArgs } from "node:util";
import { createNodeEmbedder } from "../nodeEmbedder.ts";
import {
	baselineFromReport,
	PLATFORM_TOLERANCE,
	readBaseline,
	readBaselineIfPresent,
	writeBaseline,
} from "./baseline.ts";
import { checkRecall, formatFailures } from "./gate.ts";
import {
	CORPUS_FIXTURE,
	DEFAULT_MODELS_DIR,
	RECALL_BASELINE,
} from "./paths.ts";
import { formatReport } from "./report.ts";
import { runRecall } from "./runRecall.ts";

/** Queries per segment for the per-pull-request gate. ~45 s of screening. */
const DEFAULT_PER_SEGMENT = 2000;

/** Fixed sampling seed. Changing it changes the questions, so it is committed. */
const DEFAULT_SEED = 20260803;

const PROGRESS_EVERY = 250;

interface Options {
	readonly write: boolean;
	readonly full: boolean;
	readonly perSegment: number | null;
	readonly seed: number;
	readonly modelsDir: string;
	readonly fixturePath: string;
	readonly baselinePath: string;
}

function parseOptions(argv: readonly string[]): Options {
	const { values } = parseArgs({
		args: [...argv],
		options: {
			write: { type: "boolean", default: false },
			full: { type: "boolean", default: false },
			sample: { type: "string" },
			seed: { type: "string" },
			models: { type: "string" },
			fixture: { type: "string" },
			baseline: { type: "string" },
		},
	});
	const sample = values.sample === undefined ? null : Number(values.sample);
	if (sample !== null && (!Number.isInteger(sample) || sample <= 0)) {
		throw new Error(
			`--sample must be a positive integer, got "${values.sample}"`,
		);
	}
	return {
		write: values.write === true,
		full: values.full === true,
		perSegment: values.full === true ? null : sample,
		seed: values.seed === undefined ? DEFAULT_SEED : Number(values.seed),
		modelsDir: values.models ?? DEFAULT_MODELS_DIR,
		fixturePath: values.fixture ?? CORPUS_FIXTURE,
		baselinePath: values.baseline ?? RECALL_BASELINE,
	};
}

function progress(done: number, total: number): void {
	if (done % PROGRESS_EVERY === 0 || done === total) {
		process.stdout.write(`\r  screened ${done}/${total}   `);
	}
	if (done === total) {
		process.stdout.write("\n");
	}
}

/**
 * The gate's sampling MUST match the baseline's, or the comparison is between
 * two different question sets. Explicit flags win; otherwise the baseline's own
 * recorded seed and sample size are replayed.
 */
function samplingFor(
	options: Options,
	recorded: { readonly seed: number; readonly perSegment: number | null },
): { readonly seed: number; readonly perSegment: number | null } {
	if (options.full) {
		return { seed: options.seed, perSegment: null };
	}
	return {
		seed: options.perSegment === null ? recorded.seed : options.seed,
		perSegment:
			options.perSegment ?? recorded.perSegment ?? DEFAULT_PER_SEGMENT,
	};
}

async function main(): Promise<number> {
	const options = parseOptions(process.argv.slice(2));
	const existing = options.write ? null : readBaseline(options.baselinePath);
	const sampling = samplingFor(
		options,
		existing?.report.sample ?? {
			seed: options.seed,
			perSegment: options.perSegment,
		},
	);
	const report = await runRecall({
		fixturePath: options.fixturePath,
		perSegment: sampling.perSegment,
		seed: sampling.seed,
		embedder: createNodeEmbedder(options.modelsDir),
		onProgress: progress,
	});
	console.log(formatReport(report));

	if (options.write) {
		// Floors ratchet: whatever is already committed is kept wherever it is
		// stricter than this run, so re-running the tool can never lower a bar.
		const baseline = baselineFromReport(
			report,
			PLATFORM_TOLERANCE,
			readBaselineIfPresent(options.baselinePath),
		);
		writeBaseline(options.baselinePath, baseline);
		console.log(`\nwrote baseline: ${options.baselinePath}`);
		return 0;
	}
	if (existing === null) {
		throw new Error("no baseline to compare against");
	}
	const verdict = checkRecall(report, existing.floors);
	if (verdict.ok) {
		console.log(
			"\nrecall gate PASSED — every segment is at or above its floor",
		);
		return 0;
	}
	console.error(
		`\nrecall gate FAILED — ${verdict.failures.length} floor(s) breached:\n${formatFailures(verdict.failures)}`,
	);
	return 1;
}

process.exitCode = await main();
