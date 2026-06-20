// The signed multi-list catalog — the trust-rooted registry of published lists.
//
// catalog.json lists every per-list directory the browser can load. It is signed
// with the SAME key as each list's watchlist.json, so the catalog is the single
// trust anchor: verify the catalog, then verify each list it points at. Each
// entry's `version` MUST equal that list's manifest version (callers feed the
// WatchlistManifest publishWatchlist returns straight in).
//
// Determinism: lists are sorted by id and serialized with the shared toBytes, so
// identical (lists, generatedAt) ⇒ byte-identical catalog.json.

import { toBytes } from "./publisher.ts";
import { writeSigned } from "./signing.ts";

/** One list's entry in the catalog. */
export interface CatalogList {
	readonly id: string;
	readonly title: string;
	/** Equals the list's manifest version. */
	readonly version: string;
	readonly entitiesCount: number;
	/** The per-list directory, relative to the catalog (e.g. "ofac/"). */
	readonly path: string;
}

/** The catalog document. */
export interface Catalog {
	readonly schema: 1;
	/** ISO-8601 UTC instant. */
	readonly generatedAt: string;
	readonly lists: readonly CatalogList[];
}

/** Build the catalog, sorting lists by id for deterministic output. */
export function buildCatalog(
	lists: readonly CatalogList[],
	generatedAt: string,
): Catalog {
	const sorted = [...lists].sort((a, b) =>
		a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
	);
	return { schema: 1, generatedAt, lists: sorted };
}

/** Write catalog.json + a detached catalog.json.sig into `outDir`. */
export async function writeSignedCatalog(
	outDir: string,
	catalog: Catalog,
	privateKey: Uint8Array,
): Promise<void> {
	await writeSigned(outDir, "catalog.json", toBytes(catalog), privateKey);
}
