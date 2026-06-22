// buildLoadedWatchlist tests: the pure decode/build/project path over a base64
// JSON watchlist (the engine's test seam). These prove the wire→domain projection
// (dob lifting, alias canonicalization, risk_category narrowing) and the
// fail-closed shape/length checks. The REAL committed signed-bundle load is
// covered end-to-end by bundleSource.test.ts + sync/demoBundleParity.test.ts; the
// binary bundle-files builder by watchlist.bundle.test.ts.

import { describe, expect, it } from "vitest";
import {
	buildLoadedWatchlist,
	type Watchlist,
	type WatchlistEntity,
	WatchlistFormatError,
} from "./watchlist";

const DIM = 384;

/** Encode a Float32 matrix (entityCount x DIM) as base64 LE bytes. */
function encodeVectors(matrix: Float32Array): string {
	return Buffer.from(matrix.buffer).toString("base64");
}

/** A minimal 2-entity watchlist with axis-aligned, L2-normalized rows. */
function fixtureWatchlist(overrides: Partial<Watchlist> = {}): Watchlist {
	const matrix = new Float32Array(2 * DIM);
	matrix[0 * DIM + 0] = 1;
	matrix[1 * DIM + 1] = 1;
	return {
		listId: "OFAC_SDN",
		version: "demo-1",
		generatedAt: "2026-06-19T00:00:00Z",
		model: "Xenova/all-MiniLM-L6-v2",
		dim: DIM,
		entities: [
			{
				entity_id: "DEMO:1",
				name_canonical: "ivan fakovich",
				aliases: ["Vanya Fakovich"],
				dob: "1971-03-14",
				countries: ["RU"],
				risk_category: "SANCTION",
				source_list: "DEMO_SDN",
				list_version: "2026-05-01",
			},
			{
				entity_id: "DEMO:2",
				name_canonical: "olga notrealova",
				aliases: [],
				dob: null,
				countries: ["RU"],
				risk_category: "SANCTION",
				source_list: "DEMO_SDN",
				list_version: "2026-05-01",
			},
		],
		vectors: encodeVectors(matrix),
		...overrides,
	};
}

/** A single well-typed entity (DEMO:1) carrying the given risk_category. */
function withRiskCategory(riskCategory: string): WatchlistEntity {
	return {
		entity_id: "DEMO:1",
		name_canonical: "ivan fakovich",
		aliases: ["Vanya Fakovich"],
		dob: "1971-03-14",
		countries: ["RU"],
		risk_category: riskCategory,
		source_list: "DEMO_SDN",
		list_version: "2026-05-01",
	};
}

/** A 1-entity watchlist whose sole entity carries the given risk_category. */
function singleEntityWatchlist(riskCategory: string): Watchlist {
	const matrix = new Float32Array(DIM);
	matrix[0] = 1;
	return fixtureWatchlist({
		entities: [withRiskCategory(riskCategory)],
		vectors: encodeVectors(matrix),
	});
}

describe("buildLoadedWatchlist — decode + project", () => {
	it("builds an index + id->Entity map from decoded vectors", () => {
		const loaded = buildLoadedWatchlist(fixtureWatchlist());
		expect(loaded.version).toBe("demo-1");
		expect(loaded.listId).toBe("OFAC_SDN");
		expect(loaded.index.ntotal).toBe(2);
		expect(loaded.index.dim).toBe(DIM);
		expect(loaded.entities.size).toBe(2);
	});

	it("projects the lean wire entity onto the domain Entity shape", () => {
		const entity = buildLoadedWatchlist(fixtureWatchlist()).entities.get(
			"DEMO:1",
		);
		expect(entity).toBeDefined();
		// dob string -> array; aliases string[] -> Alias[]; type defaulted; display name.
		expect(entity?.entity_type).toBe("PERSON");
		expect(entity?.primary_name).toBe("Ivan Fakovich");
		expect(entity?.dob).toEqual(["1971-03-14"]);
		expect(entity?.aliases[0]?.name).toBe("Vanya Fakovich");
		expect(entity?.aliases[0]?.name_canonical).toBe("vanya fakovich");
		expect(entity?.countries).toEqual(["RU"]);
	});

	it("maps a null dob to an empty array", () => {
		const entity = buildLoadedWatchlist(fixtureWatchlist()).entities.get(
			"DEMO:2",
		);
		expect(entity?.dob).toEqual([]);
	});

	it("normalizes a non-ISO wire dob to its ISO prefix (older/cached catalogs)", () => {
		// A catalog whose entity DOB was NOT canonicalized at publish time (e.g. an
		// older bundle or a source-shaped value) must still land ISO so dob_match
		// can slice the year — buildLoaded defends the entity-DOB boundary.
		const messy = singleEntityWatchlist("SANCTION");
		const wire = messy.entities[0];
		expect(wire).toBeDefined();
		const dirty: Watchlist = {
			...messy,
			entities: [{ ...(wire as WatchlistEntity), dob: "12/04/1980" }],
		};
		const entity = buildLoadedWatchlist(dirty).entities.get("DEMO:1");
		expect(entity?.dob).toEqual(["1980-04-12"]);
	});

	it("leaves an already-ISO wire dob unchanged (idempotent)", () => {
		// normalizeDob is idempotent on ISO input — the common already-canonical
		// catalog path must not move.
		const entity = buildLoadedWatchlist(fixtureWatchlist()).entities.get(
			"DEMO:1",
		);
		expect(entity?.dob).toEqual(["1971-03-14"]);
	});

	it("drops an unparseable wire dob to an empty array", () => {
		// An entity DOB that cannot be canonicalized must not reach the scorer as a
		// junk string (which would slice a meaningless year); it becomes no-DOB.
		const messy = singleEntityWatchlist("SANCTION");
		const wire = messy.entities[0];
		expect(wire).toBeDefined();
		const dirty: Watchlist = {
			...messy,
			entities: [{ ...(wire as WatchlistEntity), dob: "not a date" }],
		};
		const entity = buildLoadedWatchlist(dirty).entities.get("DEMO:1");
		expect(entity?.dob).toEqual([]);
	});

	it("the exact-hit query ranks its entity first via cosine", () => {
		const loaded = buildLoadedWatchlist(fixtureWatchlist());
		const q = new Float32Array(DIM);
		q[0] = 1;
		expect(loaded.index.search(q, 2)[0]?.id).toBe("DEMO:1");
	});

	it("rejects a watchlist whose dim is not 384 (fail-closed)", () => {
		expect(() => buildLoadedWatchlist(fixtureWatchlist({ dim: 128 }))).toThrow(
			WatchlistFormatError,
		);
	});

	it("rejects a vectors buffer whose length disagrees with entities*dim", () => {
		const short = encodeVectors(new Float32Array(DIM)); // 1 row for 2 entities
		expect(() =>
			buildLoadedWatchlist(fixtureWatchlist({ vectors: short })),
		).toThrow(WatchlistFormatError);
	});

	it("rejects a watchlist entity whose risk_category is outside the allowed union (fail-closed)", () => {
		const bogus = singleEntityWatchlist("BOGUS");
		expect(() => buildLoadedWatchlist(bogus)).toThrow(WatchlistFormatError);
	});

	it("accepts a non-SANCTION risk_category that is in the union (e.g. WHITELIST)", () => {
		const ok = singleEntityWatchlist("WHITELIST");
		const entity = buildLoadedWatchlist(ok).entities.get("DEMO:1");
		expect(entity?.risk_category).toBe("WHITELIST");
	});
});
