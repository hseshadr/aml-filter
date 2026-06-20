// Signed-JSON watchlist load tests. These cover the pure decode/build/project
// path (buildLoadedWatchlist) and an end-to-end verify-then-build round trip
// over the REAL committed signed demo watchlist + pinned key — the same
// fail-closed contract the runtime drives in the tab, minus the fetch transport
// (the fetch/same-origin wiring is exercised by the C1 browser e2e).

import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyEd25519 } from "./crypto";
import {
	catalogBytes,
	catalogSig,
	pubkeyRaw,
	watchlistBytes,
	watchlistManifestBytes,
	watchlistManifestSig,
	watchlistSig,
} from "./fixtures";
import {
	assertCatalogShape,
	buildLoadedWatchlist,
	fetchVerifiedCatalog,
	loadList,
	type Watchlist,
	type WatchlistCatalog,
	type WatchlistCatalogEntry,
	type WatchlistEntity,
	WatchlistFormatError,
} from "./watchlist";

const DIM = 384;
const DECODER = new TextDecoder();

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

describe("signed-JSON load — verify then build over the REAL committed artifact", () => {
	it("the committed watchlist verifies and builds a query-ready index", async () => {
		const bytes = watchlistBytes();
		// Verify FAIL-CLOSED before parse, exactly as the loader does.
		await expect(
			verifyEd25519(pubkeyRaw(), bytes, watchlistSig()),
		).resolves.toBeUndefined();
		const watchlist = JSON.parse(DECODER.decode(bytes)) as Watchlist;
		const loaded = buildLoadedWatchlist(watchlist);
		expect(loaded.index.ntotal).toBe(watchlist.entities.length);
		expect(loaded.index.dim).toBe(DIM);
		// The committed OFAC per-list demo includes Ivan Fakovich (OFAC_SDN:0001).
		expect(loaded.entities.get("OFAC_SDN:0001")?.primary_name).toBe(
			"Ivan Fakovich",
		);
	});

	it("a tampered watchlist body fails verification (no fallback)", async () => {
		const tampered = watchlistBytes().slice();
		tampered[10] = (tampered[10] ?? 0) ^ 0xff;
		await expect(
			verifyEd25519(pubkeyRaw(), tampered, watchlistSig()),
		).rejects.toThrow();
	});
});

/** A valid catalog object for mutating in the fail-closed shape tests. */
function validCatalog(): WatchlistCatalog {
	return {
		schema: 1,
		generatedAt: "2026-06-19T00:00:00Z",
		lists: [
			{
				id: "OFAC_SDN",
				title: "OFAC SDN",
				version: "demo-1",
				entitiesCount: 3,
				path: "ofac/",
			},
		],
	};
}

describe("assertCatalogShape — fail-closed validation", () => {
	it("accepts a well-formed catalog", () => {
		expect(() => assertCatalogShape(validCatalog())).not.toThrow();
	});

	it("rejects a catalog whose schema is not 1", () => {
		const bad = { ...validCatalog(), schema: 2 } as unknown as WatchlistCatalog;
		expect(() => assertCatalogShape(bad)).toThrow(WatchlistFormatError);
	});

	it("rejects a catalog whose lists is not an array", () => {
		const bad = {
			...validCatalog(),
			lists: "nope",
		} as unknown as WatchlistCatalog;
		expect(() => assertCatalogShape(bad)).toThrow(WatchlistFormatError);
	});

	it("rejects a list entry missing required string fields", () => {
		const bad = {
			...validCatalog(),
			lists: [{ id: "X", title: "X", version: "1", path: "x/" }],
		} as unknown as WatchlistCatalog;
		// entitiesCount is absent → not a finite number → reject.
		expect(() => assertCatalogShape(bad)).toThrow(WatchlistFormatError);
	});

	it("rejects a list entry whose entitiesCount is not finite", () => {
		const bad = {
			...validCatalog(),
			lists: [
				{
					id: "X",
					title: "X",
					version: "1",
					path: "x/",
					entitiesCount: Number.NaN,
				},
			],
		} as unknown as WatchlistCatalog;
		expect(() => assertCatalogShape(bad)).toThrow(WatchlistFormatError);
	});
});

/** A Response over raw bytes (copied into a fresh ArrayBuffer for BodyInit). */
function bytesResponse(bytes: Uint8Array): Response {
	const copy = new Uint8Array(bytes.length);
	copy.set(bytes);
	return new Response(copy.buffer);
}

/** Map a fetched URL to the committed bytes/sig for the per-list OFAC files. */
function ofacFetch(url: string): Response {
	if (url.endsWith("catalog.json.sig")) return new Response(catalogSig());
	if (url.endsWith("catalog.json")) return bytesResponse(catalogBytes());
	if (url.endsWith("watchlist.manifest.json.sig"))
		return new Response(watchlistManifestSig());
	if (url.endsWith("watchlist.manifest.json"))
		return bytesResponse(watchlistManifestBytes());
	if (url.endsWith("watchlist.json.sig")) return new Response(watchlistSig());
	if (url.endsWith("watchlist.json")) return bytesResponse(watchlistBytes());
	throw new Error(`unexpected fetch ${url}`);
}

describe("fetchVerifiedCatalog + loadList — verify-gated fetch path", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("fetches + verifies + validates the REAL committed catalog", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn((u: string) => Promise.resolve(ofacFetch(u))),
		);
		const catalog = await fetchVerifiedCatalog(pubkeyRaw());
		expect(catalog.schema).toBe(1);
		expect(catalog.lists.map((l) => l.id)).toContain("OFAC_SDN");
	});

	it("rejects a tampered catalog body (verify fail-closed, no validate)", async () => {
		const tampered = catalogBytes().slice();
		tampered[8] = (tampered[8] ?? 0) ^ 0xff;
		vi.stubGlobal(
			"fetch",
			vi.fn((u: string) =>
				Promise.resolve(
					u.endsWith("catalog.json.sig")
						? new Response(catalogSig())
						: bytesResponse(tampered),
				),
			),
		);
		await expect(fetchVerifiedCatalog(pubkeyRaw())).rejects.toThrow();
	});

	it("loadList rejects a catalog/manifest version skew (fail-closed)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn((u: string) => Promise.resolve(ofacFetch(u))),
		);
		// The committed OFAC list is version "demo-1"; claim "demo-2" in the entry.
		const skewed: WatchlistCatalogEntry = {
			id: "OFAC_SDN",
			title: "OFAC SDN",
			version: "demo-2",
			entitiesCount: 3,
			path: "ofac/",
		};
		await expect(loadList(pubkeyRaw(), skewed)).rejects.toThrow(
			WatchlistFormatError,
		);
	});

	it("loadList loads + verifies the OFAC list when versions agree", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn((u: string) => Promise.resolve(ofacFetch(u))),
		);
		const entry: WatchlistCatalogEntry = {
			id: "OFAC_SDN",
			title: "OFAC SDN",
			version: "demo-1",
			entitiesCount: 3,
			path: "ofac/",
		};
		const loaded = await loadList(pubkeyRaw(), entry);
		expect(loaded.listId).toBe("OFAC_SDN");
		expect(loaded.entities.get("OFAC_SDN:0001")?.primary_name).toBe(
			"Ivan Fakovich",
		);
	});
});
