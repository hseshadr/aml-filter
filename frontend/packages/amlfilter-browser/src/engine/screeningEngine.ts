// The in-browser OFAC screen — a faithful port of the backend's no-Postgres
// bundle path (aml_filter.bundle.screening.BundleScreeningSource.screen):
//
//   1. embed the query name with transformers.js MiniLM (same model as the
//      producer), giving the `name_vector` signal via cosine over the bundle's
//      stored, L2-normalized embeddings;
//   2. over-fetch k*2 vector candidates from the flat index;
//   3. for each candidate, derive `name_trigram` from a SequenceMatcher ratio
//      over canonical names, then run the ported scoring policy (alias/dob/
//      country signals + preset weights);
//   4. keep candidates at or above the threshold, sort by score, take top-k;
//   5. project to the backend's Match / SearchResponse shape.
//
// No FastAPI on this path — everything runs in the tab over the synced bundle.

import {
	EMPTY_IDENTIFIERS,
	type Entity,
	type Match,
	type OfacBundleMeta,
	type ScreenQuery,
	type ScreenResponse,
} from "./domain";
import type { Embedder } from "./embedder";
import { parseEntities } from "./entities";
import { canonicalize } from "./normalize";
import {
	computeScore,
	PRESETS,
	type Preset,
	type ScoringWeights,
} from "./scoring";
import { sequenceRatio } from "./sequenceMatcher";
import { loadVectorIndex, type VectorIndex } from "./vectorIndex";

const DECODER = new TextDecoder();

/** The four reassembled bundle files the screen is built from. */
export interface ScreeningBundleFiles {
	/** entities.jsonl — one JSON Entity per line. */
	readonly entities: Uint8Array;
	/** vector/index.faiss — binary FAISS IndexFlatIP. */
	readonly index: Uint8Array;
	/** vector/state.json — the faiss_ids row->entity_id map. */
	readonly state: Uint8Array;
	/** ofac_meta.json — list/version/model metadata. */
	readonly meta: Uint8Array;
}

/** Options for one screen call (defaults mirror the backend SearchQuery). */
export interface ScreenOptions {
	/** Preset whose weights/threshold to score with (default "balanced"). */
	readonly preset?: Preset;
}

function parseMeta(bytes: Uint8Array): OfacBundleMeta {
	return JSON.parse(DECODER.decode(bytes)) as OfacBundleMeta;
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
		const start = Date.now();
		const preset = PRESETS[options.preset ?? "balanced"];
		const threshold = query.threshold ?? preset.threshold;
		const k = query.k ?? 20;
		const queryCanonical = canonicalize(query.name);

		const queryVec = await this.#embedder.embed(query.name);
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
				dob: query.dob ?? null,
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

/** Parse the synced bundle files and build a query-ready ScreeningEngine. */
export function createScreeningEngine(
	files: ScreeningBundleFiles,
	embedder: Embedder,
): ScreeningEngine {
	const index = loadVectorIndex({ index: files.index, state: files.state });
	const entities = parseEntities(files.entities);
	const meta = parseMeta(files.meta);
	return new ScreeningEngine(index, entities, meta, embedder);
}
