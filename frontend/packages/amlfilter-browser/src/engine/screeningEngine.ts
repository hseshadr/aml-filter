// The in-browser OFAC screen — a faithful port of the backend's no-Postgres
// screening path (aml_filter.bundle.screening.BundleScreeningSource.screen):
//
//   1. embed the query name with transformers.js MiniLM (same model as the
//      publisher), giving the `name_vector` signal via cosine over the
//      watchlist's stored, L2-normalized embeddings;
//   2. over-fetch k*2 vector candidates from the flat index;
//   3. for each candidate, derive `name_trigram` from a SequenceMatcher ratio
//      over canonical names, then run the ported scoring policy (alias/dob/
//      country signals + preset weights);
//   4. keep candidates at or above the threshold, sort by score, take top-k;
//   5. project to the backend's Match / SearchResponse shape.
//
// No FastAPI on this path — everything runs in the tab over the signed,
// verified watchlist (see ./watchlist).

import {
	EMPTY_IDENTIFIERS,
	type Entity,
	type Match,
	type OfacBundleMeta,
	type ScreenQuery,
	type ScreenResponse,
} from "./domain";
import type { Embedder } from "./embedder";
import { EMBEDDING_MODEL } from "./embedder";
import { canonicalize, normalizeDob } from "./normalize";
import {
	computeScore,
	PRESETS,
	type Preset,
	type ScoringWeights,
} from "./scoring";
import { sequenceRatio } from "./sequenceMatcher";
import type { VectorIndex } from "./vectorIndex";
import type { LoadedWatchlist } from "./watchlist";

/** Options for one screen call (defaults mirror the backend SearchQuery). */
export interface ScreenOptions {
	/** Preset whose weights/threshold to score with (default "balanced"). */
	readonly preset?: Preset;
}

/** Synthesize the engine's OfacBundleMeta from a loaded watchlist. */
function metaOf(loaded: LoadedWatchlist): OfacBundleMeta {
	return {
		list_id: loaded.listId,
		version: loaded.version,
		entity_count: loaded.entities.size,
		embedding_model: EMBEDDING_MODEL,
		embedding_dim: loaded.index.dim,
	};
}

interface Scored {
	readonly score: number;
	readonly entity: Entity;
	readonly match: Match;
}

/** A loaded, query-ready OFAC screen over one synced bundle. */
export class ScreeningEngine {
	readonly #index: VectorIndex;
	readonly #entities: ReadonlyMap<string, Entity>;
	readonly #meta: OfacBundleMeta;
	readonly #embedder: Embedder;

	public constructor(
		index: VectorIndex,
		entities: ReadonlyMap<string, Entity>,
		meta: OfacBundleMeta,
		embedder: Embedder,
	) {
		this.#index = index;
		this.#entities = entities;
		this.#meta = meta;
		this.#embedder = embedder;
	}

	public get meta(): OfacBundleMeta {
		return this.#meta;
	}

	/** Every entity in the synced bundle — backs the search UI's browse/empty state. */
	public allEntities(): ReadonlyArray<Entity> {
		return [...this.#entities.values()];
	}

	/** Screen a query name against the synced bundle, in-tab (no backend). */
	public async screen(
		query: ScreenQuery,
		options: ScreenOptions = {},
	): Promise<ScreenResponse> {
		const queryVec = await this.#embedder.embed(query.name);
		return this.screenWithVector(query, queryVec, options);
	}

	/**
	 * Screen with an ALREADY-embedded query vector (synchronous). This is the
	 * post-embed half of {@link screen}; the multi-list engine embeds the query
	 * ONCE and screens N lists by calling this per list with the shared vector.
	 */
	public screenWithVector(
		query: ScreenQuery,
		queryVec: Float32Array,
		options: ScreenOptions = {},
	): ScreenResponse {
		const start = Date.now();
		const preset = PRESETS[options.preset ?? "balanced"];
		const threshold = query.threshold ?? preset.threshold;
		const k = query.k ?? 20;
		const queryCanonical = canonicalize(query.name);

		const candidates = this.#index.search(queryVec, k * 2);
		const scored = this.#scoreCandidates(
			candidates,
			query,
			queryCanonical,
			preset.weights,
			threshold,
		);
		scored.sort((a, b) => b.score - a.score);
		const top = scored.slice(0, k);

		return {
			request_id: crypto.randomUUID(),
			matches: top.map((s) => s.match),
			list_versions_used: this.#versionsOf(top),
			execution_time_ms: Date.now() - start,
		};
	}

	#scoreCandidates(
		candidates: ReadonlyArray<{ readonly id: string; readonly score: number }>,
		query: ScreenQuery,
		queryCanonical: string,
		weights: ScoringWeights,
		threshold: number,
	): Scored[] {
		const out: Scored[] = [];
		for (const candidate of candidates) {
			const entity = this.#entities.get(candidate.id);
			if (entity === undefined) {
				continue;
			}
			const scored = this.#scoreOne(
				entity,
				candidate.score,
				query,
				queryCanonical,
				weights,
			);
			if (scored.score >= threshold) {
				out.push(scored);
			}
		}
		return out;
	}

	#scoreOne(
		entity: Entity,
		vectorSimilarity: number,
		query: ScreenQuery,
		queryCanonical: string,
		weights: ScoringWeights,
	): Scored {
		const result = computeScore(
			entity,
			{
				nameCanonical: queryCanonical,
				// The scorer's dob_match assumes ISO (it slices [0,4] for the year), so
				// canonicalize a human-typed query DOB ("12/04/1980", "10 Dec 1948") to
				// its ISO prefix here; null/empty/unparseable stays null. Idempotent on
				// already-ISO input, so the scoring golden is unaffected.
				dob:
					query.dob !== undefined && query.dob !== null
						? normalizeDob(query.dob)
						: null,
				country: query.country ?? null,
				entityType: query.entityType ?? null,
				vectorSimilarity,
				trigramSimilarity: sequenceRatio(queryCanonical, entity.name_canonical),
			},
			weights,
		);
		const match: Match = {
			entity_id: entity.entity_id,
			score: result.score,
			entity_type: entity.entity_type,
			risk_category: entity.risk_category,
			source_list: entity.source_list,
			list_version: entity.list_version,
			primary_name: entity.primary_name,
			aliases: entity.aliases.map((a) => a.name),
			countries: entity.countries,
			nationalities: entity.nationalities ?? [],
			dob: entity.dob,
			addresses: entity.addresses ?? [],
			identifiers: entity.identifiers ?? EMPTY_IDENTIFIERS,
			reasons: result.reasons,
			explanation: result.summary,
		};
		return { score: result.score, entity, match };
	}

	#versionsOf(scored: ReadonlyArray<Scored>): Readonly<Record<string, string>> {
		const versions: Record<string, string> = {};
		for (const { entity } of scored) {
			versions[entity.source_list] = entity.list_version;
		}
		return versions;
	}
}

/** Build a query-ready ScreeningEngine from a loaded, verified watchlist. */
export function createScreeningEngine(
	loaded: LoadedWatchlist,
	embedder: Embedder,
): ScreeningEngine {
	return new ScreeningEngine(
		loaded.index,
		loaded.entities,
		metaOf(loaded),
		embedder,
	);
}
