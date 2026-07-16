// MultiListScreeningEngine: one warm embedder, N signed lists, one scoring
// contract. These cover cross-list aggregation + sort + top-k, the per-list
// threshold mechanism, the single-embed guarantee, and list_versions_used
// aggregation. Fakes are built with buildLoadedWatchlist + axis-aligned vectors
// and a stub embedder, mirroring screeningEngine.test.ts.

import { describe, expect, it, vi } from "vitest";
import type { Embedder } from "./embedder";
import {
	createMultiListScreeningEngine,
	createStreamingMultiListScreeningEngine,
	type ListThresholds,
} from "./multiEngine";
import { VectorIndex } from "./vectorIndex";
import { buildLoadedWatchlist, type Watchlist } from "./watchlist";

const DIM = 384;

/** A single-entity list whose sole entity sits on axis 0 and is named `name`. */
function oneEntityList(
	listId: string,
	version: string,
	entityId: string,
	name: string,
): Watchlist {
	const matrix = new Float32Array(DIM);
	matrix[0] = 1; // axis 0 — the query vector hits this exactly.
	return {
		listId,
		version,
		generatedAt: "2026-06-19T00:00:00Z",
		model: "Xenova/all-MiniLM-L6-v2",
		dim: DIM,
		entities: [
			{
				entity_id: entityId,
				name_canonical: name,
				aliases: [],
				dob: null,
				countries: ["RU"],
				risk_category: "SANCTION",
				source_list: listId,
				list_version: version,
			},
		],
		vectors: Buffer.from(matrix.buffer).toString("base64"),
	};
}

/** A stub embedder that always returns the axis-0 direction (an exact hit). */
function axisZeroEmbedder(): Embedder {
	return {
		embed(): Promise<Float32Array> {
			const v = new Float32Array(DIM);
			v[0] = 1;
			return Promise.resolve(v);
		},
	};
}

const DEFAULT: ListThresholds = { default: 0.65 };

describe("MultiListScreeningEngine — cross-list aggregation", () => {
	it("returns hits from BOTH lists, sorted by score descending", async () => {
		// Both entities are EXACT canonical matches (vector + trigram both 1) so
		// both clear the default threshold. A's country corroborates the query →
		// A outscores B, fixing the sort order deterministically.
		const a = buildLoadedWatchlist(
			oneEntityList("A", "v1", "A:1", "ivan fako"),
		);
		const b = buildLoadedWatchlist(
			oneEntityList("B", "v1", "B:1", "ivan fako"),
		);
		const engine = createMultiListScreeningEngine(
			[a, b],
			axisZeroEmbedder(),
			DEFAULT,
		);
		// oneEntityList puts every entity in country RU; corroborate it for A only
		// by querying with country RU — both clear, A gets the country boost.
		const res = await engine.screen({ name: "ivan fako", country: "RU" });
		const ids = res.matches.map((m) => m.entity_id);
		expect(ids).toContain("A:1");
		expect(ids).toContain("B:1");
		// Sorted by score desc (both share the country boost, so just assert order).
		expect(res.matches[0]?.score ?? 0).toBeGreaterThanOrEqual(
			res.matches[1]?.score ?? 0,
		);
	});

	it("respects top-k across the concatenated, sorted matches", async () => {
		const a = buildLoadedWatchlist(
			oneEntityList("A", "v1", "A:1", "ivan fako"),
		);
		const b = buildLoadedWatchlist(
			oneEntityList("B", "v1", "B:1", "ivan fako"),
		);
		const engine = createMultiListScreeningEngine(
			[a, b],
			axisZeroEmbedder(),
			DEFAULT,
		);
		const res = await engine.screen({ name: "ivan fako", k: 1 });
		expect(res.matches).toHaveLength(1);
	});

	it("aggregates list_versions_used across every list that hit", async () => {
		const a = buildLoadedWatchlist(
			oneEntityList("A", "va", "A:1", "ivan fako"),
		);
		const b = buildLoadedWatchlist(
			oneEntityList("B", "vb", "B:1", "ivan fako"),
		);
		const engine = createMultiListScreeningEngine(
			[a, b],
			axisZeroEmbedder(),
			DEFAULT,
		);
		const res = await engine.screen({ name: "ivan fako" });
		expect(res.list_versions_used).toEqual({ A: "va", B: "vb" });
	});
});

describe("MultiListScreeningEngine — per-list thresholds", () => {
	it("a strict per-list bar suppresses that list but not another list's hit", async () => {
		const a = buildLoadedWatchlist(
			oneEntityList("A", "v1", "A:1", "ivan fako"),
		);
		const b = buildLoadedWatchlist(
			oneEntityList("B", "v1", "B:1", "ivan fako"),
		);
		// B's bar is impossibly high; A keeps the default bar.
		const thresholds: ListThresholds = {
			default: 0.65,
			perList: { B: 0.999 },
		};
		const engine = createMultiListScreeningEngine(
			[a, b],
			axisZeroEmbedder(),
			thresholds,
		);
		const res = await engine.screen({ name: "ivan fako" });
		const ids = res.matches.map((m) => m.entity_id);
		expect(ids).toContain("A:1"); // A's strong hit survives
		expect(ids).not.toContain("B:1"); // B's hit suppressed by its strict bar
	});
});

describe("MultiListScreeningEngine — single-embed guarantee", () => {
	it("embeds the query EXACTLY ONCE across N lists", async () => {
		const embed = vi.fn(() => {
			const v = new Float32Array(DIM);
			v[0] = 1;
			return Promise.resolve(v);
		});
		const embedder: Embedder = { embed };
		const lists = [
			buildLoadedWatchlist(oneEntityList("A", "v1", "A:1", "ivan fako")),
			buildLoadedWatchlist(oneEntityList("B", "v1", "B:1", "ivan fako")),
			buildLoadedWatchlist(oneEntityList("C", "v1", "C:1", "ivan fako")),
		];
		const engine = createMultiListScreeningEngine(lists, embedder, DEFAULT);
		await engine.screen({ name: "ivan fako" });
		expect(embed).toHaveBeenCalledTimes(1);
	});
});

describe("MultiListScreeningEngine — streaming residency", () => {
	it("keeps metadata browseable and loads one vector index at a time", async () => {
		const a = buildLoadedWatchlist(
			oneEntityList("A", "v1", "A:1", "ivan fako"),
		);
		const b = buildLoadedWatchlist(
			oneEntityList("B", "v1", "B:1", "ivan fako"),
		);
		let active = 0;
		let peak = 0;
		const source = (loaded: typeof a) => ({
			listId: loaded.listId,
			version: loaded.version,
			entities: loaded.entities,
			load: async () => {
				active += 1;
				peak = Math.max(peak, active);
				await Promise.resolve();
				const originalDispose = loaded.index.dispose.bind(loaded.index);
				loaded.index.dispose = () => {
					active -= 1;
					originalDispose();
				};
				return loaded;
			},
		});
		const engine = createStreamingMultiListScreeningEngine(
			[source(a), source(b)],
			axisZeroEmbedder(),
			DEFAULT,
		);

		expect(engine.allEntities().map((entity) => entity.entity_id)).toEqual([
			"A:1",
			"B:1",
		]);
		const result = await engine.screen({ name: "ivan fako" });
		expect(result.matches).toHaveLength(2);
		expect(peak).toBe(1);
		expect(active).toBe(1);
		engine.dispose();
		expect(active).toBe(0);
	});

	it("releases a streamed index when screening fails", async () => {
		const loaded = buildLoadedWatchlist(
			oneEntityList("A", "v1", "A:1", "ivan fako"),
		);
		const dispose = vi.spyOn(loaded.index, "dispose");
		const engine = createStreamingMultiListScreeningEngine(
			[
				{
					listId: loaded.listId,
					version: loaded.version,
					entities: loaded.entities,
					load: async () => {
						throw new Error("list failed");
					},
				},
			],
			axisZeroEmbedder(),
			DEFAULT,
		);
		await expect(engine.screen({ name: "ivan fako" })).rejects.toThrow(
			/list failed/,
		);
		expect(dispose).not.toHaveBeenCalled();
	});

	it("disposes a streamed index when scoring throws", async () => {
		const loaded = {
			index: new VectorIndex(new Float32Array(1), ["A:1"], 1),
			entities: new Map(),
			version: "v1",
			listId: "A",
		};
		const dispose = vi.spyOn(loaded.index, "dispose");
		const engine = createStreamingMultiListScreeningEngine(
			[
				{
					listId: "A",
					version: "v1",
					entities: loaded.entities,
					load: async () => loaded,
				},
			],
			axisZeroEmbedder(),
			DEFAULT,
		);
		await expect(engine.screen({ name: "ivan fako" })).rejects.toThrow(
			/query vector/,
		);
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	it("serializes overlapping screens so streamed indexes never overlap", async () => {
		const loaded = buildLoadedWatchlist(
			oneEntityList("A", "v1", "A:1", "ivan fako"),
		);
		let resolveLoad: (() => void) | undefined;
		let active = 0;
		let peak = 0;
		const engine = createStreamingMultiListScreeningEngine(
			[
				{
					listId: loaded.listId,
					version: loaded.version,
					entities: loaded.entities,
					load: async () => {
						active += 1;
						peak = Math.max(peak, active);
						await new Promise<void>((resolve) => {
							resolveLoad = resolve;
						});
						const next = buildLoadedWatchlist(
							oneEntityList("A", "v1", "A:1", "ivan fako"),
						);
						const dispose = next.index.dispose.bind(next.index);
						next.index.dispose = () => {
							active -= 1;
							dispose();
						};
						return next;
					},
				},
			],
			axisZeroEmbedder(),
			DEFAULT,
		);
		const first = engine.screen({ name: "ivan fako" });
		const second = engine.screen({ name: "ivan fako" });
		await vi.waitFor(() => expect(resolveLoad).toBeDefined());
		resolveLoad?.();
		await Promise.all([first, second]);
		expect(peak).toBe(1);
		expect(active).toBe(1);
		engine.dispose();
		expect(active).toBe(0);
	});

	it("releases a list that finishes loading after engine disposal", async () => {
		const loaded = buildLoadedWatchlist(
			oneEntityList("A", "v1", "A:1", "ivan fako"),
		);
		const dispose = vi.spyOn(loaded.index, "dispose");
		let resolveLoad: (() => void) | undefined;
		const engine = createStreamingMultiListScreeningEngine(
			[
				{
					listId: loaded.listId,
					version: loaded.version,
					entities: loaded.entities,
					load: async () => {
						await new Promise<void>((resolve) => {
							resolveLoad = resolve;
						});
						return loaded;
					},
				},
			],
			axisZeroEmbedder(),
			DEFAULT,
		);
		const pending = engine.screen({ name: "ivan fako" });
		await vi.waitFor(() => expect(resolveLoad).toBeDefined());
		engine.dispose();
		resolveLoad?.();
		await expect(pending).rejects.toThrow(/disposed/);
		expect(dispose).toHaveBeenCalledTimes(1);
	});
});

describe("MultiListScreeningEngine — browse + version accessors", () => {
	it("allEntities concatenates entities across lists", async () => {
		const a = buildLoadedWatchlist(
			oneEntityList("A", "v1", "A:1", "ivan fako"),
		);
		const b = buildLoadedWatchlist(
			oneEntityList("B", "v1", "B:1", "olga noto"),
		);
		const engine = createMultiListScreeningEngine(
			[a, b],
			axisZeroEmbedder(),
			DEFAULT,
		);
		expect(
			engine
				.allEntities()
				.map((e) => e.entity_id)
				.sort(),
		).toEqual(["A:1", "B:1"]);
	});

	it("listVersions maps each listId to its loaded version", () => {
		const a = buildLoadedWatchlist(oneEntityList("A", "va", "A:1", "x"));
		const b = buildLoadedWatchlist(oneEntityList("B", "vb", "B:1", "y"));
		const engine = createMultiListScreeningEngine(
			[a, b],
			axisZeroEmbedder(),
			DEFAULT,
		);
		expect(engine.listVersions()).toEqual({ A: "va", B: "vb" });
	});
});
