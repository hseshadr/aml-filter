// The multi-list in-browser screen — Theme A wave 2. One warm embedder, N
// loaded watchlists (one ScreeningEngine per list), one scoring contract.
//
// The query is embedded ONCE; each per-list ScreeningEngine is driven via its
// synchronous screenWithVector(...) with the shared vector. The per-list
// matches are concatenated, re-sorted by score, and truncated to top-k, so a
// strong hit in ANY list surfaces. Per-list thresholds let one list set a
// stricter bar without suppressing another list's strong hit.
//
// It satisfies the same `screen(query): Promise<ScreenResponse>` shape as a
// single ScreeningEngine, so onboarding/rescan/review consume it unchanged.

import type { Entity, Match, ScreenQuery, ScreenResponse } from "./domain";
import type { Embedder } from "./embedder";
import {
	createScreeningEngine,
	type ScreeningEngine,
	type ScreenOptions,
} from "./screeningEngine";
import type { LoadedWatchlist } from "./watchlist";

/** Per-list score floors: a default for every list + optional overrides by id. */
export interface ListThresholds {
	readonly default: number;
	readonly perList?: Readonly<Record<string, number>>;
}

/** One loaded list paired with its query-ready engine. */
interface ListEngine {
	readonly listId: string;
	readonly version: string;
	readonly engine: ScreeningEngine;
}

/** A multi-list, in-tab screen: one embed, N lists, one scoring contract. */
export class MultiListScreeningEngine {
	readonly #lists: ReadonlyArray<ListEngine>;
	readonly #embedder: Embedder;
	readonly #thresholds: ListThresholds;

	public constructor(
		lists: ReadonlyArray<ListEngine>,
		embedder: Embedder,
		thresholds: ListThresholds,
	) {
		this.#lists = lists;
		this.#embedder = embedder;
		this.#thresholds = thresholds;
	}

	/** Every entity across every list — backs the search UI's browse view. */
	public allEntities(): ReadonlyArray<Entity> {
		return this.#lists.flatMap((l) => l.engine.allEntities());
	}

	/** Each list's loaded version, keyed by list id — for the composite stamp. */
	public listVersions(): Readonly<Record<string, string>> {
		const out: Record<string, string> = {};
		for (const l of this.#lists) {
			out[l.listId] = l.version;
		}
		return out;
	}

	/** The effective score floor for a list: per-list override, else query, else default. */
	#thresholdFor(listId: string, query: ScreenQuery): number {
		return (
			this.#thresholds.perList?.[listId] ??
			query.threshold ??
			this.#thresholds.default
		);
	}

	/** Screen across every list with a single shared query embedding. */
	public async screen(
		query: ScreenQuery,
		options: ScreenOptions = {},
	): Promise<ScreenResponse> {
		const start = Date.now();
		const queryVec = await this.#embedder.embed(query.name);
		const matches: Match[] = [];
		const versions: Record<string, string> = {};
		for (const { listId, engine } of this.#lists) {
			const threshold = this.#thresholdFor(listId, query);
			const res = engine.screenWithVector(
				{ ...query, threshold },
				queryVec,
				options,
			);
			matches.push(...res.matches);
			Object.assign(versions, res.list_versions_used);
		}
		matches.sort((a, b) => b.score - a.score);
		return {
			request_id: crypto.randomUUID(),
			matches: matches.slice(0, query.k ?? 20),
			list_versions_used: versions,
			execution_time_ms: Date.now() - start,
		};
	}
}

/** Build a MultiListScreeningEngine: one ScreeningEngine per list, one embedder. */
export function createMultiListScreeningEngine(
	loadedLists: ReadonlyArray<LoadedWatchlist>,
	embedder: Embedder,
	thresholds: ListThresholds,
): MultiListScreeningEngine {
	const lists = loadedLists.map((loaded) => ({
		listId: loaded.listId,
		version: loaded.version,
		engine: createScreeningEngine(loaded, embedder),
	}));
	return new MultiListScreeningEngine(lists, embedder, thresholds);
}
