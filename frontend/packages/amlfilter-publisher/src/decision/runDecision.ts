// One decision-measurement run, wired end to end: frozen fixture → real embedder
// → real engine → three segments of queries → emitted artifact. Kept separate
// from the CLI so the run is a plain function with typed options.
//
// The engine, the corpus and the labels are the recall harness's, reused rather
// than rebuilt: the same frozen 19,181-entity snapshot, the same production
// bundle-loading path, the same alias/canonical labels derived from the feed's
// own structure. The only additions are the third segment (generated negatives)
// and the fact that what is recorded is the DECISION, not the rank.

import { readFileSync } from "node:fs";
import {
	type Embedder,
	ENGINE_VERSION,
	type ScreeningEngine,
} from "@amlfilter/browser";
import { buildRecallCorpus } from "../recall/corpus.ts";
import { decodeFixture, sha256Hex } from "../recall/fixture.ts";
import {
	buildLabelledQueries,
	buildOwnerIndex,
	type LabelledQuery,
	type QueryKind,
} from "../recall/labels.ts";
import { measureSegment } from "../recall/measure.ts";
import type { SegmentReport } from "../recall/report.ts";
import { sampleDeterministic } from "../recall/sample.ts";
import { RECALL_CUTOFFS } from "../recall/screenParams.ts";
import type { DecisionArtifact, EmittedQuery } from "./artifact.ts";
import {
	cleanTargetOf,
	emitSegment,
	type OnProgress,
	type RankedScreen,
	targetOf,
} from "./emit.ts";
import { DECISION_LEVELS, EMIT_SCREEN_PARAMS } from "./levels.ts";
import { buildCleanQueries, buildPlainQueries } from "./negatives.ts";

/** Version stamp for the rebuilt corpus. Frozen data ⇒ frozen version. */
const FIXTURE_LIST_VERSION = "decision-fixture";

/** Options for {@link runDecision}. */
export interface RunDecisionOptions {
	readonly fixturePath: string;
	/** Queries per segment. All three segments get the same count. */
	readonly perSegment: number;
	readonly seed: number;
	readonly embedder: Embedder;
	readonly onProgress?: OnProgress;
	readonly now?: () => Date;
}

/** Screen with the emit parameters: live `k`, threshold 0 (see ./levels). */
function emitScreen(engine: ScreeningEngine): RankedScreen {
	return (query: string) =>
		engine.screen({
			name: query,
			threshold: EMIT_SCREEN_PARAMS.threshold,
			k: EMIT_SCREEN_PARAMS.k,
		});
}

/**
 * Replay the emitted rows through the recall harness's OWN measurement code.
 *
 * No re-screening: the ranked ids come straight off the rows just written, so
 * `measureSegment` (and through it `rankOfExpected` and `tally`) sees exactly
 * the same input the Python cross-check will. That is the point — the two sides
 * must be scoring identical evidence, or an agreement check proves nothing.
 */
function replayScreen(
	rows: readonly EmittedQuery[],
): (query: string) => Promise<readonly string[]> {
	const byQuery = new Map(
		rows.map((row) => [
			row.query,
			row.candidates.filter((c) => c.retrieved).map((c) => c.entityId),
		]),
	);
	return async (query: string) => byQuery.get(query) ?? [];
}

function recallOf(
	kind: QueryKind,
	queries: readonly LabelledQuery[],
	rows: readonly EmittedQuery[],
): Promise<SegmentReport> {
	return measureSegment({
		kind,
		queries,
		screen: replayScreen(rows),
		cutoffs: RECALL_CUTOFFS,
	});
}

/** Measure the decision over the frozen corpus. Returns the full artifact. */
export async function runDecision(
	options: RunDecisionOptions,
): Promise<DecisionArtifact> {
	const bytes = readFileSync(options.fixturePath);
	const lines = decodeFixture(bytes);
	const corpus = await buildRecallCorpus(
		lines,
		options.embedder,
		FIXTURE_LIST_VERSION,
	);
	const labelled = buildLabelledQueries(lines);
	const owners = buildOwnerIndex(lines);
	const hard = buildCleanQueries(
		lines,
		owners,
		options.perSegment,
		options.seed,
	);
	const plain = buildPlainQueries(
		lines,
		owners,
		options.perSegment,
		options.seed,
	);
	const screen = emitScreen(corpus.engine);

	const queries: EmittedQuery[] = [];
	const recallCheck: SegmentReport[] = [];
	for (const kind of ["alias", "canonical"] as const) {
		const sampled = sampleDeterministic(
			labelled[kind],
			options.perSegment,
			options.seed,
		);
		const rows = await emitSegment({
			segment: kind,
			targets: sampled.map(targetOf),
			screen,
			startId: queries.length,
			...(options.onProgress === undefined
				? {}
				: { onProgress: options.onProgress }),
		});
		queries.push(...rows);
		recallCheck.push(await recallOf(kind, sampled, rows));
	}
	for (const [segment, generated] of [
		["clean-hard", hard],
		["clean-plain", plain],
	] as const) {
		queries.push(
			...(await emitSegment({
				segment,
				targets: generated.map(cleanTargetOf),
				screen,
				startId: queries.length,
				...(options.onProgress === undefined
					? {}
					: { onProgress: options.onProgress }),
			})),
		);
	}

	return {
		header: {
			kind: "header",
			schemaVersion: 1,
			measuredAt: (options.now?.() ?? new Date()).toISOString(),
			engineVersion: ENGINE_VERSION,
			corpus: {
				listId: corpus.listId,
				entities: corpus.entities,
				fixture: options.fixturePath.split("/").pop() ?? options.fixturePath,
				fixtureSha256: sha256Hex(bytes),
			},
			retrieval: EMIT_SCREEN_PARAMS,
			levels: DECISION_LEVELS,
			sample: {
				seed: options.seed,
				perSegment: options.perSegment,
				availableAlias: labelled.alias.length,
				availableCanonical: labelled.canonical.length,
				cleanHardGenerated: hard.length,
				cleanPlainGenerated: plain.length,
			},
			recallCheck,
		},
		queries,
	};
}
