import { describe, expect, it } from "vitest";
import type { Entity, MatchReason, OfacBundleMeta } from "./domain";
import type { Embedder } from "./embedder";
import { createScreeningEngine, ScreeningEngine } from "./screeningEngine";
import { VectorIndex } from "./vectorIndex";
import { buildLoadedWatchlist, type Watchlist } from "./watchlist";

const DIM = 384;

/** A synthetic 3-entity watchlist with deterministic, axis-aligned vectors.
 * Row 0 (e_ivanov) is the [1,0,...] direction the stub embedder hits. */
function fixtureWatchlist(): Watchlist {
	const matrix = new Float32Array(3 * DIM);
	matrix[0 * DIM + 0] = 1; // e_ivanov along axis 0
	matrix[1 * DIM + 1] = 1; // e_petrov along axis 1
	matrix[2 * DIM + 2] = 1; // e_acme along axis 2
	const vectors = Buffer.from(matrix.buffer).toString("base64");
	return {
		listId: "OFAC_SDN",
		version: "2026-05-30",
		generatedAt: "2026-05-30T00:00:00Z",
		model: "Xenova/all-MiniLM-L6-v2",
		dim: DIM,
		entities: [
			{
				entity_id: "e_ivanov",
				name_canonical: "vladimir ivanov",
				aliases: [],
				dob: "1970-01-01",
				countries: ["RU"],
				risk_category: "SANCTION",
				source_list: "OFAC_SDN",
				list_version: "2026-05-30",
			},
			{
				entity_id: "e_petrov",
				name_canonical: "sergei petrov",
				aliases: [],
				dob: null,
				countries: ["RU"],
				risk_category: "SANCTION",
				source_list: "OFAC_SDN",
				list_version: "2026-05-30",
			},
			{
				entity_id: "e_acme",
				name_canonical: "acme holdings",
				aliases: [],
				dob: null,
				countries: ["US"],
				risk_category: "SANCTION",
				source_list: "OFAC_SDN",
				list_version: "2026-05-30",
			},
		],
		vectors,
	};
}

function makeEngine(): ScreeningEngine {
	return createScreeningEngine(
		buildLoadedWatchlist(fixtureWatchlist()),
		stubEmbedder(),
	);
}

/**
 * A deterministic stub embedder that returns the [1,0,...] direction (the
 * e_ivanov vector) for the sanctioned name, and an orthogonal vector for
 * anything else — so screening is model-free + reproducible.
 */
function stubEmbedder(): Embedder {
	return {
		embed(text: string): Promise<Float32Array> {
			const v = new Float32Array(DIM);
			if (text.toLowerCase().includes("ivanov")) {
				v[0] = 1; // aligns with e_ivanov's stored vector
			} else {
				v[383] = 1; // orthogonal to every stored vector
			}
			return Promise.resolve(v);
		},
	};
}

describe("ScreeningEngine — in-browser OFAC screen", () => {
	it("synthesizes the bundle metadata from the watchlist", () => {
		const engine = makeEngine();
		expect(engine.meta.list_id).toBe("OFAC_SDN");
		expect(engine.meta.entity_count).toBe(3);
		expect(engine.meta.embedding_dim).toBe(DIM);
		expect(engine.meta.version).toBe("2026-05-30");
	});

	it("scores an exact-name sanctioned hit high with an explanation", async () => {
		const res = await makeEngine().screen({ name: "Vladimir Ivanov" });
		expect(res.matches.length).toBeGreaterThan(0);
		const top = res.matches[0];
		expect(top?.primary_name).toBe("Vladimir Ivanov");
		expect(top?.risk_category).toBe("SANCTION");
		expect(top?.score).toBeGreaterThan(0.65);
		// explainable: carries the weighted signals + a plain-language summary
		const signals = top?.reasons.map((r) => r.signal) ?? [];
		expect(signals).toContain("name_vector");
		expect(signals).toContain("name_trigram");
		expect(top?.explanation).toContain("Match due to");
		expect(res.list_versions_used.OFAC_SDN).toBe("2026-05-30");
	});

	it("returns no matches for a random unrelated name", async () => {
		const res = await makeEngine().screen({ name: "Jane Q Public" });
		expect(res.matches).toHaveLength(0);
	});

	it("boosts the score when country corroborates", async () => {
		const withCountry = await makeEngine().screen({
			name: "Vladimir Ivanov",
			country: "RU",
		});
		const nameOnly = await makeEngine().screen({ name: "Vladimir Ivanov" });
		const a = withCountry.matches[0]?.score ?? 0;
		const b = nameOnly.matches[0]?.score ?? 0;
		expect(a).toBeGreaterThan(b);
		const countrySignal = withCountry.matches[0]?.reasons.find(
			(r) => r.signal === "country_match",
		);
		expect(countrySignal?.value).toBe(1);
	});

	it("honors a custom threshold (a high floor screens the hit out)", async () => {
		const res = await makeEngine().screen({
			name: "Vladimir Ivanov",
			threshold: 0.999,
		});
		expect(res.matches).toHaveLength(0);
	});

	it("exposes the full entity list for browsing (no query)", () => {
		const all = makeEngine().allEntities();
		expect(all).toHaveLength(3);
		expect(all.map((e) => e.primary_name)).toContain("Vladimir Ivanov");
	});
});

// Union retrieval. The stub embedder below is deliberately BLIND: it returns the
// same orthogonal vector for every query except the one exact string it knows,
// so an entity can only be reached lexically. That is the point — before the
// union, retrieval was vector-only and an alias-reachable entity was invisible
// no matter what it would have scored.
describe("ScreeningEngine — retrieval unions vector and lexical candidates", () => {
	/** 30 decoys plus one target, so the target is far outside any vector top-k. */
	function crowdedWatchlist(): Watchlist {
		const count = 31;
		const matrix = new Float32Array(count * DIM);
		for (let i = 0; i < count; i += 1) {
			matrix[i * DIM + (i % 300)] = 1;
		}
		const entities = Array.from({ length: count - 1 }, (_, i) => ({
			entity_id: `e_decoy_${i}`,
			name_canonical: `decoy person ${i}`,
			aliases: [] as string[],
			dob: null,
			countries: [],
			risk_category: "SANCTION",
			source_list: "OFAC_SDN",
			list_version: "2026-05-30",
		}));
		return {
			listId: "OFAC_SDN",
			version: "2026-05-30",
			generatedAt: "2026-05-30T00:00:00Z",
			model: "Xenova/all-MiniLM-L6-v2",
			dim: DIM,
			entities: [
				...entities,
				{
					entity_id: "e_zawahiri",
					name_canonical: "al zawahiri ayman",
					aliases: ["SALIM, Ahmad Fuad"],
					dob: null,
					countries: [],
					risk_category: "SANCTION",
					source_list: "OFAC_SDN",
					list_version: "2026-05-30",
				},
			],
			vectors: Buffer.from(matrix.buffer).toString("base64"),
		} as Watchlist;
	}

	/** Every query maps to the same vector, orthogonal to every stored row. */
	function blindEmbedder(): Embedder {
		return {
			embed(): Promise<Float32Array> {
				const v = new Float32Array(DIM);
				v[383] = 1;
				return Promise.resolve(v);
			},
		};
	}

	function crowdedEngine(): ScreeningEngine {
		return createScreeningEngine(
			buildLoadedWatchlist(crowdedWatchlist()),
			blindEmbedder(),
		);
	}

	it("retrieves an entity reachable ONLY through a published alias", async () => {
		// "salim"/"ahmad"/"fuad" appear in no primary name and in no vector. The
		// only path to this entity is the alias-aware lexical index.
		const res = await crowdedEngine().screen({
			name: "SALIM, Ahmad Fuad",
			threshold: 0.3,
			k: 25,
		});
		expect(res.matches.map((m) => m.entity_id)).toContain("e_zawahiri");
	});

	it("retrieves an entity through a shared pronunciation the vectors miss", async () => {
		// "aiman" is not a token of any indexed name; only the Double-Metaphone
		// key it shares with "ayman" reaches it. Threshold 0 on purpose: this
		// asserts RETRIEVAL, and with a blind embedder there is no vector signal
		// left to score with. Whether it then clears a real floor is the scorer's
		// job, measured against the real corpus by the recall harness.
		const res = await crowdedEngine().screen({
			name: "Aiman al-Zawahiri",
			threshold: 0,
			k: 25,
		});
		expect(res.matches.map((m) => m.entity_id)).toContain("e_zawahiri");
	});

	it("gives a lexical-only candidate its REAL cosine, not a placeholder", async () => {
		const res = await crowdedEngine().screen({
			name: "SALIM, Ahmad Fuad",
			threshold: 0,
			k: 25,
		});
		const hit = res.matches.find((m) => m.entity_id === "e_zawahiri");
		const vector = hit?.reasons.find((r) => r.signal === "name_vector");
		// The embedder is orthogonal to every stored row, so the honest cosine is
		// ~0. A fabricated stand-in would show up here as anything else.
		expect(vector?.value).toBeCloseTo(0, 5);
	});

	it("still returns nothing for a name sharing neither token nor sound", async () => {
		const res = await crowdedEngine().screen({
			name: "Zzyzx Nobody",
			threshold: 0.3,
			k: 25,
		});
		expect(res.matches).toHaveLength(0);
	});
});

// A rich entity carrying the dossier fields the search UI surfaces. Built with a
// tiny real VectorIndex so the projection is exercised end-to-end.
function richEntity(): Entity {
	return {
		entity_id: "e_rich",
		entity_type: "PERSON",
		primary_name: "Ivan Fakovich",
		name_canonical: "ivan fakovich",
		aliases: [
			{
				name: "Vanya Fakovich",
				name_canonical: "vanya fakovich",
				source: "DEMO",
			},
		],
		dob: ["1971-03-14"],
		countries: ["RU"],
		nationalities: ["RU"],
		addresses: ["123 Invented Prospekt, Madeupgrad"],
		identifiers: {
			passport: ["FAKE0001"],
			national_id: [],
			other: { swift: [] },
		},
		risk_category: "SANCTION",
		source_list: "DEMO_SDN",
		list_version: "demo-v1",
	};
}

function richEngine(): ScreeningEngine {
	const matrix = new Float32Array([1, 0, 0, 0]);
	const index = new VectorIndex(matrix, ["e_rich"], 4);
	const entities = new Map<string, Entity>([["e_rich", richEntity()]]);
	const meta: OfacBundleMeta = {
		list_id: "DEMO_SDN",
		version: "demo-v1",
		entity_count: 1,
		embedding_model: "stub",
		embedding_dim: 4,
	};
	const embedder: Embedder = {
		embed: () => Promise.resolve(new Float32Array([1, 0, 0, 0])),
	};
	return new ScreeningEngine(index, entities, meta, embedder);
}

describe("ScreeningEngine — match carries the full dossier", () => {
	it("projects entity_type, nationalities, addresses and identifiers onto the match", async () => {
		const res = await richEngine().screen({
			name: "Ivan Fakovich",
			threshold: 0,
		});
		const top = res.matches[0];
		expect(top?.entity_type).toBe("PERSON");
		expect(top?.nationalities).toEqual(["RU"]);
		expect(top?.addresses).toEqual(["123 Invented Prospekt, Madeupgrad"]);
		expect(top?.identifiers.passport).toEqual(["FAKE0001"]);
		// aliases still flattened to display names
		expect(top?.aliases).toEqual(["Vanya Fakovich"]);
	});
});

// The rich entity's DOB is the ISO "1971-03-14". A human-typed query DOB in any
// of the source shapes must be canonicalized at the engine boundary BEFORE it
// reaches the scorer (which assumes ISO + slices [0,4] for the year), so it
// scores a dob_match instead of failing a raw-string compare.
describe("ScreeningEngine — query DOB is normalized at the scorer boundary", () => {
	function dobReason(
		reasons: ReadonlyArray<MatchReason> | undefined,
	): MatchReason | undefined {
		return reasons?.find((r) => r.signal === "dob_match");
	}

	it("day-first dd/mm/yyyy yields an exact DOB match against the ISO entity DOB", async () => {
		const res = await richEngine().screen({
			name: "Ivan Fakovich",
			dob: "14/03/1971",
			threshold: 0,
		});
		const reason = dobReason(res.matches[0]?.reasons);
		expect(reason).toBeDefined();
		expect(reason?.value).toBe(1);
		expect(reason?.description).toBe("Exact DOB match: 1971-03-14");
	});

	it("day month-name year yields an exact DOB match against the ISO entity DOB", async () => {
		const res = await richEngine().screen({
			name: "Ivan Fakovich",
			dob: "14 Mar 1971",
			threshold: 0,
		});
		const reason = dobReason(res.matches[0]?.reasons);
		expect(reason?.value).toBe(1);
		expect(reason?.description).toBe("Exact DOB match: 1971-03-14");
	});

	it("a bare year yields a year-level DOB match against the ISO entity DOB", async () => {
		const res = await richEngine().screen({
			name: "Ivan Fakovich",
			dob: "1971",
			threshold: 0,
		});
		const reason = dobReason(res.matches[0]?.reasons);
		expect(reason?.value).toBe(0.5);
		expect(reason?.description).toBe("Year match: 1971");
	});

	it("an unparseable query DOB is treated as no DOB (no junk year slice)", async () => {
		const res = await richEngine().screen({
			name: "Ivan Fakovich",
			dob: "not a date",
			threshold: 0,
		});
		const reason = dobReason(res.matches[0]?.reasons);
		// query.dob normalizes to null → scorer omits the dob_match reason entirely.
		expect(reason).toBeUndefined();
	});
});
