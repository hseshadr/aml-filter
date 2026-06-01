import { describe, expect, it } from "vitest";
import type { Entity, OfacBundleMeta } from "./domain";
import type { Embedder } from "./embedder";
import {
	stagedEntities,
	stagedIndex,
	stagedMeta,
	stagedState,
} from "./fixtures";
import {
	createScreeningEngine,
	type ScreeningBundleFiles,
	ScreeningEngine,
} from "./screeningEngine";
import { VectorIndex } from "./vectorIndex";

const DIM = 384;

function files(): ScreeningBundleFiles {
	return {
		entities: stagedEntities(),
		index: stagedIndex(),
		state: stagedState(),
		meta: stagedMeta(),
	};
}

/**
 * A deterministic stub embedder that returns the fixture's exact-hit direction
 * (the e_ivanov vector, seed=1.0) for the sanctioned name, and an orthogonal
 * vector for anything else — so screening is model-free + reproducible.
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
	it("exposes the bundle metadata", () => {
		const engine = createScreeningEngine(files(), stubEmbedder());
		expect(engine.meta.list_id).toBe("OFAC_SDN");
		expect(engine.meta.entity_count).toBe(3);
		expect(engine.meta.embedding_dim).toBe(DIM);
	});

	it("scores an exact-name sanctioned hit high with an explanation", async () => {
		const engine = createScreeningEngine(files(), stubEmbedder());
		const res = await engine.screen({ name: "Vladimir Ivanov" });
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
		const engine = createScreeningEngine(files(), stubEmbedder());
		const res = await engine.screen({ name: "Jane Q Public" });
		expect(res.matches).toHaveLength(0);
	});

	it("boosts the score when DOB and country corroborate", async () => {
		const engine = createScreeningEngine(files(), stubEmbedder());
		const withCountry = await engine.screen({
			name: "Vladimir Ivanov",
			country: "RU",
		});
		const nameOnly = await engine.screen({ name: "Vladimir Ivanov" });
		const a = withCountry.matches[0]?.score ?? 0;
		const b = nameOnly.matches[0]?.score ?? 0;
		expect(a).toBeGreaterThan(b);
		const countrySignal = withCountry.matches[0]?.reasons.find(
			(r) => r.signal === "country_match",
		);
		expect(countrySignal?.value).toBe(1);
	});

	it("honors a custom threshold (a high floor screens the hit out)", async () => {
		const engine = createScreeningEngine(files(), stubEmbedder());
		const res = await engine.screen({
			name: "Vladimir Ivanov",
			threshold: 0.999,
		});
		expect(res.matches).toHaveLength(0);
	});

	it("exposes the full entity list for browsing (no query)", () => {
		const engine = createScreeningEngine(files(), stubEmbedder());
		const all = engine.allEntities();
		expect(all).toHaveLength(3);
		expect(all.map((e) => e.primary_name)).toContain("Vladimir Ivanov");
	});
});

// A rich entity carrying the dossier fields the search UI surfaces. Built with a
// tiny real VectorIndex so the projection is exercised end-to-end without the
// (deliberately minimal) signed-bundle fixture.
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
