// One measurement run, wired end to end: frozen fixture → real embedder → real
// engine → labelled queries → report. Kept separate from the CLI so the run is a
// plain function with typed options rather than argv handling.

import { readFileSync } from "node:fs";
import type { Embedder, ScreeningEngine } from "@amlfilter/browser";
import { runAuditQueries } from "./auditQueries.ts";
import { buildRecallCorpus } from "./corpus.ts";
import { decodeFixture, sha256Hex } from "./fixture.ts";
import { buildLabelledQueries, type LabelledQuery } from "./labels.ts";
import { measureSegment, type OnProgress } from "./measure.ts";
import type { RecallReport, SegmentReport } from "./report.ts";
import { sampleDeterministic } from "./sample.ts";
import { RECALL_CUTOFFS, RECALL_SCREEN_PARAMS } from "./screenParams.ts";

/** Version stamp for the rebuilt corpus. Frozen data ⇒ frozen version. */
const FIXTURE_LIST_VERSION = "recall-fixture";

/** Options for {@link runRecall}. */
export interface RunRecallOptions {
	/** Path to the gzipped-JSONL corpus fixture. */
	readonly fixturePath: string;
	/** Queries screened per segment; `null` measures every labelled query. */
	readonly perSegment: number | null;
	readonly seed: number;
	readonly embedder: Embedder;
	readonly onProgress?: OnProgress;
	/** Injected so the report is reproducible in tests. */
	readonly now?: () => Date;
}

function sampled(
	queries: readonly LabelledQuery[],
	perSegment: number | null,
	seed: number,
): readonly LabelledQuery[] {
	return perSegment === null
		? queries
		: sampleDeterministic(queries, perSegment, seed);
}

/** Screen a query with the parameters the live /screen page uses. */
function rankedScreen(
	engine: ScreeningEngine,
): (query: string) => Promise<readonly string[]> {
	return async (query: string) => {
		const response = await engine.screen({
			name: query,
			threshold: RECALL_SCREEN_PARAMS.threshold,
			k: RECALL_SCREEN_PARAMS.k,
		});
		return response.matches.map((m) => m.entity_id);
	};
}

/** Measure recall over the frozen corpus. Returns the full report. */
export async function runRecall(
	options: RunRecallOptions,
): Promise<RecallReport> {
	const bytes = readFileSync(options.fixturePath);
	const lines = decodeFixture(bytes);
	const corpus = await buildRecallCorpus(
		lines,
		options.embedder,
		FIXTURE_LIST_VERSION,
	);
	const labelled = buildLabelledQueries(lines);
	const screen = rankedScreen(corpus.engine);
	const segments: SegmentReport[] = [];
	for (const kind of ["alias", "canonical"] as const) {
		segments.push(
			await measureSegment({
				kind,
				queries: sampled(labelled[kind], options.perSegment, options.seed),
				screen,
				cutoffs: RECALL_CUTOFFS,
				...(options.onProgress === undefined
					? {}
					: { onProgress: options.onProgress }),
			}),
		);
	}
	return {
		schemaVersion: 2,
		measuredAt: (options.now?.() ?? new Date()).toISOString(),
		corpus: {
			listId: corpus.listId,
			entities: corpus.entities,
			fixture: options.fixturePath.split("/").pop() ?? options.fixturePath,
			fixtureSha256: sha256Hex(bytes),
		},
		screen: RECALL_SCREEN_PARAMS,
		sample: {
			seed: options.seed,
			perSegment: options.perSegment,
			availableAlias: labelled.alias.length,
			availableCanonical: labelled.canonical.length,
		},
		segments,
		audit: await runAuditQueries(screen),
	};
}
