// THE CATALOG-SIDE GUARD THAT HAS TO BE ABLE TO FAIL.
//
// `catalog.json` is the first thing the bundle path parses and the ONLY place
// the settings UI can learn how old each list is before any list is downloaded.
// So every entry must carry provable freshness — `fetchedAt`, `sourceUpdatedAt`,
// `stale`, `staleReason` — and `isBundleCatalogList` must REJECT an entry that
// does not. A list whose age we cannot state is a list we cannot honestly serve,
// and "the field was missing so assume it's fresh" is exactly the lie this
// guards against.
//
// Unlike bundleSource.test.ts (which drives the REAL committed origin tree),
// this drives a hand-built catalog through a fake BundleEngineClient so each
// field can be mutated or dropped one at a time.

import { describe, expect, it } from "vitest";
import {
	type BundleEngineClient,
	type BundleSourceDeps,
	openBundleSource,
} from "./bundleSource";
import type { SyncResult } from "./sync/types";
import { WatchlistFormatError } from "./watchlist";

const ENCODER = new TextEncoder();

const BASE_URL = "https://bundle.example/bundle/origin";
const PUBKEY_URL = "https://app.example/public.key";

/** One well-formed catalog entry — the shape the publisher stages. */
function catalogEntry(): Record<string, unknown> {
	return {
		id: "EU_CONSOLIDATED",
		title: "EU Consolidated",
		slug: "eu",
		version: "demo-1",
		entitiesCount: 2,
		fetchedAt: "2026-06-21T09:30:00Z",
		sourceUpdatedAt: "2026-06-20T00:00:00Z",
		stale: false,
		staleReason: null,
	};
}

/** A catalog.json whose single entry has been mutated (or had a field deleted). */
function catalogBytes(
	mutate: (entry: Record<string, unknown>) => void = () => {},
): Uint8Array {
	const entry = catalogEntry();
	mutate(entry);
	return ENCODER.encode(
		JSON.stringify({
			schemaVersion: 1,
			generatedAt: "2026-06-22T00:00:00Z",
			lists: [entry],
		}),
	);
}

/** A BundleEngineClient that serves ONE hand-built catalog.json and nothing else.
 * Sync is a no-op: this exercises the parse/narrow step, which runs before any
 * list directory is fetched. */
function fakeDeps(catalog: Uint8Array): BundleSourceDeps {
	const result: SyncResult = {
		manifestHash: "0".repeat(64),
		version: "demo-1",
		chunksFetched: 0,
		chunksReused: 0,
		bytesFetched: 0,
	};
	const client: BundleEngineClient = {
		sync: () => Promise.resolve(result),
		readFile: (path) =>
			path === "catalog.json"
				? Promise.resolve(catalog)
				: Promise.reject(new Error(`unexpected read ${path}`)),
		clear: () => Promise.resolve(),
	};
	return { createClient: () => client };
}

/** Open a bundle source over a catalog with the given entry mutation. */
function open(
	mutate?: (entry: Record<string, unknown>) => void,
): Promise<unknown> {
	return openBundleSource(BASE_URL, PUBKEY_URL, fakeDeps(catalogBytes(mutate)));
}

describe("isBundleCatalogList — per-list freshness, fail-closed", () => {
	it("accepts a catalog entry carrying complete, parseable freshness", async () => {
		const source = await open();
		expect(source).toBeDefined();
	});

	it("carries the freshness fields onto the projected catalog entry", async () => {
		const source = (await open()) as {
			loadCatalog(): {
				lists: ReadonlyArray<Record<string, unknown>>;
			};
		};
		expect(source.loadCatalog().lists[0]).toMatchObject({
			id: "EU_CONSOLIDATED",
			fetchedAt: "2026-06-21T09:30:00Z",
			sourceUpdatedAt: "2026-06-20T00:00:00Z",
			stale: false,
			staleReason: null,
		});
	});

	it("accepts a stale entry with a null sourceUpdatedAt and a stated reason", async () => {
		await expect(
			open((e) => {
				e.stale = true;
				e.staleReason = "EU feed returned HTTP 500";
				e.sourceUpdatedAt = null;
			}),
		).resolves.toBeDefined();
	});

	it("REJECTS an entry with no fetchedAt — a list we cannot age", async () => {
		await expect(
			open((e) => {
				delete e.fetchedAt;
			}),
		).rejects.toThrow(WatchlistFormatError);
	});

	it("REJECTS an empty-string fetchedAt", async () => {
		await expect(
			open((e) => {
				e.fetchedAt = "";
			}),
		).rejects.toThrow(/malformed list entry/);
	});

	it("REJECTS an unparseable fetchedAt", async () => {
		await expect(
			open((e) => {
				e.fetchedAt = "last Tuesday";
			}),
		).rejects.toThrow(/malformed list entry/);
	});

	it("REJECTS a missing stale flag — absence is NOT 'fresh'", async () => {
		await expect(
			open((e) => {
				delete e.stale;
			}),
		).rejects.toThrow(/malformed list entry/);
	});

	it('REJECTS a stringly-typed stale flag ("yes" is not a boolean)', async () => {
		await expect(
			open((e) => {
				e.stale = "yes";
			}),
		).rejects.toThrow(/malformed list entry/);
	});

	it("REJECTS a missing sourceUpdatedAt — null must be stated, not implied", async () => {
		await expect(
			open((e) => {
				delete e.sourceUpdatedAt;
			}),
		).rejects.toThrow(/malformed list entry/);
	});

	it("REJECTS an unparseable sourceUpdatedAt", async () => {
		await expect(
			open((e) => {
				e.sourceUpdatedAt = "not-a-date";
			}),
		).rejects.toThrow(/malformed list entry/);
	});

	it("REJECTS a missing staleReason", async () => {
		await expect(
			open((e) => {
				delete e.staleReason;
			}),
		).rejects.toThrow(/malformed list entry/);
	});

	it("REJECTS a non-string, non-null staleReason", async () => {
		await expect(
			open((e) => {
				e.staleReason = 500;
			}),
		).rejects.toThrow(/malformed list entry/);
	});
});
