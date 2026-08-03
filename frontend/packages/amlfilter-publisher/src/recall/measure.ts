// The measurement loop: screen each labelled query, record where (if anywhere)
// an acceptable entity came back.
//
// The screen call is INJECTED as a plain function returning ranked entity ids.
// That keeps this module pure and unit-testable against a fake ranker with a
// handful of entities — no 23 MB model, no 19k-row index — while the real run
// passes the production `ScreeningEngine.screen`. It also makes the contract
// explicit: recall is computed from the ranked ids the product returns, and from
// nothing else.

import type { LabelledQuery, QueryKind } from "./labels.ts";
import type { RecallAtK, SegmentReport } from "./report.ts";

/** Screen one query and return the matched entity ids in rank order. */
export type RankedScreen = (query: string) => Promise<readonly string[]>;

/**
 * 1-based rank of the first acceptable entity in `ranked`, or `null` when none
 * of them came back at all.
 */
export function rankOfExpected(
	ranked: readonly string[],
	expected: ReadonlySet<string>,
): number | null {
	for (let i = 0; i < ranked.length; i += 1) {
		if (expected.has(ranked[i] as string)) {
			return i + 1;
		}
	}
	return null;
}

function tally(
	ranks: readonly (number | null)[],
	cutoffs: readonly number[],
): readonly RecallAtK[] {
	const total = ranks.length;
	return cutoffs.map((k) => {
		const hits = ranks.filter((r) => r !== null && r <= k).length;
		return { k, hits, recall: total === 0 ? 0 : hits / total };
	});
}

/** Progress ping so a multi-minute run is not a silent terminal. */
export type OnProgress = (done: number, total: number) => void;

/** Everything one segment's measurement needs. */
export interface MeasureSegmentInput {
	readonly kind: QueryKind;
	readonly queries: readonly LabelledQuery[];
	readonly screen: RankedScreen;
	readonly cutoffs: readonly number[];
	readonly onProgress?: OnProgress;
}

/**
 * Screen every query in one segment and summarize.
 *
 * `absent` counts queries where no acceptable entity appeared anywhere in the
 * returned results. That deliberately does not distinguish "pruned by
 * retrieval" from "retrieved but scored under the threshold": both render the
 * same screen to the user — one that does not contain the sanctioned entity.
 */
export async function measureSegment(
	input: MeasureSegmentInput,
): Promise<SegmentReport> {
	const ranks: (number | null)[] = [];
	for (const query of input.queries) {
		const ranked = await input.screen(query.query);
		ranks.push(rankOfExpected(ranked, query.expected));
		input.onProgress?.(ranks.length, input.queries.length);
	}
	const absent = ranks.filter((r) => r === null).length;
	const total = ranks.length;
	return {
		kind: input.kind,
		queries: total,
		at: tally(ranks, input.cutoffs),
		absent,
		absentRate: total === 0 ? 0 : absent / total,
	};
}
