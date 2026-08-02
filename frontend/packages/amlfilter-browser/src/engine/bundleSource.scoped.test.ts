// The two-phase scoped sync, asserted at the seam that decides the scope.
//
// `openBundleSource` cannot know which bundle directories a list selection means
// until it has read `catalog.json` — and `catalog.json` lives inside the bundle.
// So it syncs the catalog first (one chunk), resolves the selection to `slug/`
// prefixes, then syncs those. This file pins BOTH phases: getting phase one
// wrong wastes the whole saving, and getting phase two wrong silently under- or
// over-fetches.
//
// PROVEN ABLE TO FAIL: make `wantedPathsFor` return `undefined` unconditionally
// (the pre-fix behaviour) and the first three cases go red.

import { describe, expect, it } from "vitest";
import {
	type BundleEngineClient,
	type BundleSourceDeps,
	openBundleSource,
} from "./bundleSource";
import { FRESH } from "./freshnessFixtures";

const ENCODER = new TextEncoder();

const CATALOG_JSON = JSON.stringify({
	schemaVersion: 1,
	generatedAt: "2026-08-01T00:00:00Z",
	lists: [
		{
			id: "OFAC_SDN",
			title: "OFAC SDN",
			slug: "ofac",
			version: "2026-08-01",
			entitiesCount: 19_181,
			...FRESH,
		},
		{
			id: "EU_CONSOLIDATED",
			title: "EU Consolidated",
			slug: "eu",
			version: "2026-08-01",
			entitiesCount: 5_000,
			...FRESH,
		},
		{
			id: "UK_OFSI",
			title: "UK OFSI",
			slug: "uk",
			version: "2026-08-01",
			entitiesCount: 4_000,
			...FRESH,
		},
		{
			id: "UN_CONSOLIDATED",
			title: "UN Consolidated",
			slug: "un",
			version: "2026-08-01",
			entitiesCount: 1_000,
			...FRESH,
		},
	],
});

/** Records the `wantedPaths` of every sync, in order. */
function recordingDeps(): {
	readonly deps: BundleSourceDeps;
	readonly scopes: Array<ReadonlyArray<string> | undefined>;
} {
	const scopes: Array<ReadonlyArray<string> | undefined> = [];
	const client: BundleEngineClient = {
		sync: (_baseUrl, _pubkeyUrl, _onProgress, wantedPaths) => {
			scopes.push(wantedPaths);
			return Promise.resolve({
				version: "2026-08-01",
				manifestHash: "0".repeat(64),
				chunksFetched: 0,
				chunksReused: 0,
				bytesFetched: 0,
			});
		},
		readFile: (path) =>
			path === "catalog.json"
				? Promise.resolve(ENCODER.encode(CATALOG_JSON))
				: Promise.reject(new Error(`unexpected readFile ${path}`)),
		clear: () => Promise.resolve(),
	};
	return { deps: { createClient: () => client }, scopes };
}

async function scopesFor(
	enabledLists: ReadonlyArray<string> | undefined,
): Promise<ReadonlyArray<ReadonlyArray<string> | undefined>> {
	const { deps, scopes } = recordingDeps();
	await openBundleSource(
		"/bundle/origin",
		"/public.key",
		deps,
		undefined,
		enabledLists,
	);
	return scopes;
}

describe("openBundleSource two-phase scoped sync", () => {
	it("syncs the catalog alone first, then only the selected list", async () => {
		expect(await scopesFor(["OFAC_SDN"])).toEqual([
			["catalog.json"],
			["catalog.json", "ofac/"],
		]);
	});

	it("resolves several selected lists to their own directories", async () => {
		expect(await scopesFor(["OFAC_SDN", "EU_CONSOLIDATED"])).toEqual([
			["catalog.json"],
			["catalog.json", "ofac/", "eu/"],
		]);
	});

	it("treats an empty selection as the catalog alone, not as everything", async () => {
		// The version poll relies on this. Confusing `[]` with `undefined` here is
		// the difference between a ~700-byte poll and a 46 MB one.
		expect(await scopesFor([])).toEqual([["catalog.json"], ["catalog.json"]]);
	});

	it("treats no selection as the whole bundle", async () => {
		expect(await scopesFor(undefined)).toEqual([["catalog.json"], undefined]);
	});

	it("ignores a selected id the catalog does not carry", async () => {
		// The catalog is the source of truth for existence — matching how the
		// runtime filters lists. A stale stored id must not widen the scope with a
		// directory that isn't there.
		expect(await scopesFor(["OFAC_SDN", "NOT_A_LIST"])).toEqual([
			["catalog.json"],
			["catalog.json", "ofac/"],
		]);
	});
});
