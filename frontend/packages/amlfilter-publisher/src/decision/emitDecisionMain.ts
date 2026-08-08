// The decision-harness emitter CLI.
//
//   pnpm --filter @amlfilter/publisher run emit-decision
//       Screen the seeded sample at the LIVE thresholds' inputs and write both
//       artifacts into .decision-out/ (gitignored). The Python gate in eval/
//       scores what this writes; `gate:decision` runs the two in sequence, which
//       is why there is no freshness problem to guard.
//
//   pnpm --filter @amlfilter/publisher run emit-decision -- --sample 200
//       A smaller run, for iterating locally.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createNodeEmbedder } from "../nodeEmbedder.ts";
import { decodeFixture, sha256Hex } from "../recall/fixture.ts";
import { buildOwnerIndex } from "../recall/labels.ts";
import { CORPUS_FIXTURE, DEFAULT_MODELS_DIR } from "../recall/paths.ts";
import { writeArtifact } from "./artifact.ts";
import {
	aliasPairs,
	crossPersonPairs,
	type StudyHeader,
	type StudyPair,
} from "./pairStudy.ts";
import {
	DECISION_ARTIFACT,
	DECISION_OUT_DIR,
	PAIR_STUDY_ARTIFACT,
} from "./paths.ts";
import { runDecision } from "./runDecision.ts";

/**
 * Queries per segment for the per-pull-request gate. FOUR segments, so 4× this
 * many screens: about 90 s of screening on top of ~50 s of fixed cost (model
 * load plus re-embedding all 19,181 entity names), with the weights already on
 * disk. Sized against the recall gate's own budget — the two together stay
 * inside the frontend job's 30-minute ceiling with room to spare.
 */
const DEFAULT_PER_SEGMENT = 1000;

/** Cross-person pairs for the name-similarity study. */
const DEFAULT_CROSS_PAIRS = 9000;

/** Fixed seed. Changing it changes the questions, so it is committed here. */
const DEFAULT_SEED = 20260805;

/** The engine constants the study puts a number on (engine/scoring.ts). */
const ALIAS_FUZZY_SET_RATIO = 0.6;
const ALIAS_FULL_SORT_RATIO = 0.95;

const PROGRESS_EVERY = 250;

function progress(done: number, total: number): void {
	if (done % PROGRESS_EVERY === 0 || done === total) {
		process.stdout.write(`\r  screened ${done}/${total}   `);
	}
	if (done === total) {
		process.stdout.write("\n");
	}
}

interface Options {
	readonly perSegment: number;
	readonly crossPairs: number;
	readonly seed: number;
	readonly modelsDir: string;
	readonly fixturePath: string;
}

function positiveInt(
	raw: string | undefined,
	fallback: number,
	flag: string,
): number {
	if (raw === undefined) {
		return fallback;
	}
	const value = Number(raw);
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`--${flag} must be a positive integer, got "${raw}"`);
	}
	return value;
}

function parseOptions(argv: readonly string[]): Options {
	const { values } = parseArgs({
		args: [...argv],
		options: {
			sample: { type: "string" },
			pairs: { type: "string" },
			seed: { type: "string" },
			models: { type: "string" },
			fixture: { type: "string" },
		},
	});
	return {
		perSegment: positiveInt(values.sample, DEFAULT_PER_SEGMENT, "sample"),
		crossPairs: positiveInt(values.pairs, DEFAULT_CROSS_PAIRS, "pairs"),
		seed: positiveInt(values.seed, DEFAULT_SEED, "seed"),
		modelsDir: values.models ?? DEFAULT_MODELS_DIR,
		fixturePath: values.fixture ?? CORPUS_FIXTURE,
	};
}

function writeStudy(options: Options): {
	positives: number;
	negatives: number;
} {
	const bytes = readFileSync(options.fixturePath);
	const lines = decodeFixture(bytes);
	const owners = buildOwnerIndex(lines);
	const positives = aliasPairs(lines);
	const negatives = crossPersonPairs(
		lines,
		owners,
		options.crossPairs,
		options.seed,
	);
	const header: StudyHeader = {
		kind: "header",
		schemaVersion: 1,
		measuredAt: new Date().toISOString(),
		corpus: {
			listId: lines[0]?.source_list ?? "UNKNOWN",
			entities: lines.length,
			fixtureSha256: sha256Hex(bytes),
		},
		seed: options.seed,
		positives: positives.length,
		negatives: negatives.length,
		rules: {
			aliasFuzzySetRatio: ALIAS_FUZZY_SET_RATIO,
			aliasFullSortRatio: ALIAS_FULL_SORT_RATIO,
		},
	};
	const rows: readonly StudyPair[] = [...positives, ...negatives];
	writeFileSync(
		PAIR_STUDY_ARTIFACT,
		`${[JSON.stringify(header), ...rows.map((r) => JSON.stringify(r))].join("\n")}\n`,
		"utf8",
	);
	return { positives: positives.length, negatives: negatives.length };
}

async function main(): Promise<number> {
	const options = parseOptions(process.argv.slice(2));
	mkdirSync(DECISION_OUT_DIR, { recursive: true });

	const study = writeStudy(options);
	console.log(
		`pair study: ${study.positives} alias pairs, ${study.negatives} cross-person pairs -> ${PAIR_STUDY_ARTIFACT}`,
	);

	const artifact = await runDecision({
		fixturePath: options.fixturePath,
		perSegment: options.perSegment,
		seed: options.seed,
		embedder: createNodeEmbedder(options.modelsDir),
		onProgress: progress,
	});
	writeArtifact(DECISION_ARTIFACT, artifact);
	const pairs = artifact.queries.reduce((n, q) => n + q.candidates.length, 0);
	console.log(
		`decision: ${artifact.queries.length} queries, ${pairs} pairs -> ${DECISION_ARTIFACT}`,
	);
	return 0;
}

process.exitCode = await main();
