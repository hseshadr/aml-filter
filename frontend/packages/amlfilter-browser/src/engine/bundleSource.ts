// The BUNDLE load path: turn a content-addressed, signed bundle origin into the
// SAME (catalog + per-list LoadedWatchlist) shape the JSON path produces, so the
// EngineRuntime can screen from it unchanged.
//
// It drives the recovered edge-proc delta-sync tier THROUGH A WORKER (EngineClient
// → worker.ts): the Worker owns the OPFS CacheStore (OPFS sync access handles are
// Worker-only — opening the store or reading a chunk on the MAIN thread hangs), so
// the main thread only sends typed requests and awaits bytes. One `sync` against
// the bundle base URL fetches + verifies the signed `/latest` pointer
// (cache:no-store), verifies the manifest by content hash, delta-fetches only the
// missing chunks, re-verifies each chunk + each reassembled file, and atomically
// promotes into the durable OPFS store (so a reload re-uses chunks and an offline
// reload still screens). It then `readFile`s `catalog.json` + each enabled list's
// `<slug>/{entities.jsonl,vectors.f32,meta.json}` out of the store and projects
// them onto WatchlistCatalog / LoadedWatchlist on the main thread.
//
// Trust: the Worker fetches the pinned SAME-ORIGIN pubkey (from `pubkeyUrl`, no-store)
// and verifies fail-closed — any signature/hash mismatch (over fetched OR cached
// bytes) aborts the load. The pubkey is NEVER fetched from the bundle origin.

import { EngineClient } from "./sync/client";
import type { OnSyncProgress, SyncResult } from "./sync/types";
import {
	buildLoadedFromBundleFiles,
	buildLoadedWatchlistMetadataFromBundleFiles,
	type LoadedWatchlist,
	type LoadedWatchlistMetadata,
	type WatchlistCatalog,
	type WatchlistCatalogEntry,
	WatchlistFormatError,
} from "./watchlist";

const DECODER = new TextDecoder();

/** One list entry in the bundle's materialized `catalog.json`. */
interface BundleCatalogList {
	readonly id: string;
	readonly title: string;
	readonly slug: string;
	readonly version: string;
	readonly entitiesCount: number;
}

/** The bundle's materialized `catalog.json` (publisher BundleCatalog). */
interface BundleCatalog {
	readonly schemaVersion: 1;
	readonly generatedAt: string;
	readonly lists: ReadonlyArray<BundleCatalogList>;
}

/** Narrow a single materialized bundle catalog entry fail-closed. */
function isBundleCatalogList(value: unknown): value is BundleCatalogList {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const e = value as Record<string, unknown>;
	return (
		typeof e.id === "string" &&
		typeof e.title === "string" &&
		typeof e.slug === "string" &&
		typeof e.version === "string" &&
		typeof e.entitiesCount === "number" &&
		Number.isFinite(e.entitiesCount)
	);
}

/** Validate a parsed bundle catalog fail-closed. */
function assertBundleCatalog(value: unknown): asserts value is BundleCatalog {
	if (typeof value !== "object" || value === null) {
		throw new WatchlistFormatError("bundle catalog.json is not an object");
	}
	const c = value as Record<string, unknown>;
	if (c.schemaVersion !== 1) {
		throw new WatchlistFormatError(
			`bundle catalog schemaVersion is ${String(c.schemaVersion)}; expected 1`,
		);
	}
	if (!Array.isArray(c.lists)) {
		throw new WatchlistFormatError("bundle catalog is missing a lists[] array");
	}
	for (const entry of c.lists) {
		if (!isBundleCatalogList(entry)) {
			throw new WatchlistFormatError(
				`bundle catalog has a malformed list entry: ${JSON.stringify(entry)}`,
			);
		}
	}
}

/** Project a bundle catalog onto the engine's WatchlistCatalog shape, carrying
 * `slug` as the dir prefix (with the trailing slash the JSON path's `path` uses)
 * so the runtime's id-based enabled-list filter works unchanged. */
function toWatchlistCatalog(bundle: BundleCatalog): WatchlistCatalog {
	return {
		schema: 1,
		generatedAt: bundle.generatedAt,
		lists: bundle.lists.map((l) => ({
			id: l.id,
			title: l.title,
			version: l.version,
			entitiesCount: l.entitiesCount,
			// `slug/` mirrors the JSON catalog's `path` (e.g. "ofac/") so the slug is
			// recoverable for materialization via `entry.path.replace(/\/$/, "")`.
			path: `${l.slug}/`,
		})),
	};
}

/** The bundle slug for a (catalog-projected) entry: its `path` sans trailing slash. */
function slugOf(entry: WatchlistCatalogEntry): string {
	return entry.path.replace(/\/$/, "");
}

/** The worker-backed sync client seam the bundle source drives: `sync` runs the
 * delta-sync in the Worker (where OPFS is legal), `readFile` materializes a synced
 * file's bytes out of the Worker's store. {@link EngineClient} satisfies it in the
 * browser; unit tests inject an in-process fake over a MemoryCacheStore. */
export interface BundleEngineClient {
	sync(
		baseUrl: string,
		pubkeyUrl: string,
		onProgress?: OnSyncProgress,
	): Promise<SyncResult>;
	readFile(path: string): Promise<Uint8Array>;
	clear(): Promise<void>;
	terminate?(): void;
}

/** The client seam the bundle source depends on; defaulted to a spawned Worker
 * EngineClient. Injectable so unit tests drive the committed bundle over an
 * in-memory store + an fs-backed fetch (the demoBundleParity pattern) with no
 * Worker/OPFS. */
export interface BundleSourceDeps {
	readonly createClient: () => BundleEngineClient;
}

const defaultBundleSourceDeps: BundleSourceDeps = {
	createClient: () => EngineClient.spawn(),
};

/** A synced bundle, exposing the SAME catalog + per-list loaders the runtime's
 * JSON path exposes — but reading from the materialized, content-verified store. */
export interface BundleSource {
	/** The bundle catalog projected onto the engine's WatchlistCatalog shape. */
	loadCatalog(): WatchlistCatalog;
	/** Build ONE list's LoadedWatchlist from its materialized bundle files,
	 * cross-checking the catalog/meta versions (fail-closed). */
	loadList(entry: WatchlistCatalogEntry): Promise<LoadedWatchlist>;
	/** Build browseable entity metadata without materializing vectors. */
	loadListMetadata?(
		entry: WatchlistCatalogEntry,
	): Promise<LoadedWatchlistMetadata>;
	/** The promoted bundle version (the signed `/latest` pointer's version). */
	version(): string;
	/** Drop the durable store (every chunk + manifest + the active pointer) — the
	 * "Clear cached lists" affordance; the next sync re-fetches + re-verifies. */
	clear(): Promise<void>;
}

/**
 * Delta-sync the bundle at `baseUrl` into the durable store (fail-closed verify in
 * the Worker against the pinned same-origin key at `pubkeyUrl`), then materialize +
 * validate its catalog, and return a {@link BundleSource} the runtime drives exactly
 * like the JSON loaders. The sync tier falls back to the cached active version when
 * offline (NetworkError on `/latest`), so a reload with no network still resolves.
 */
export async function openBundleSource(
	baseUrl: string,
	pubkeyUrl: string,
	deps: BundleSourceDeps = defaultBundleSourceDeps,
	onProgress?: OnSyncProgress,
): Promise<BundleSource> {
	const client = deps.createClient();
	try {
		// `onProgress` threads the cold-sync per-chunk ticks up to the boot banner;
		// undefined on reload/version-poll paths (no banner to feed).
		const result = await client.sync(baseUrl, pubkeyUrl, onProgress);

		const bundleCatalog: unknown = JSON.parse(
			DECODER.decode(await client.readFile("catalog.json")),
		);
		assertBundleCatalog(bundleCatalog);
		const catalog = toWatchlistCatalog(bundleCatalog);

		const loadList = async (
			entry: WatchlistCatalogEntry,
		): Promise<LoadedWatchlist> => {
			const slug = slugOf(entry);
			const [entitiesJsonl, vectorsF32, meta] = await Promise.all([
				client.readFile(`${slug}/entities.jsonl`),
				client.readFile(`${slug}/vectors.f32`),
				client.readFile(`${slug}/meta.json`),
			]);
			const loaded = buildLoadedFromBundleFiles({
				entitiesJsonl,
				vectorsF32,
				meta,
			});
			if (loaded.version !== entry.version) {
				throw new WatchlistFormatError(
					`bundle list ${entry.id} version skew: catalog ${entry.version}, meta ${loaded.version}`,
				);
			}
			return loaded;
		};
		const loadListMetadata = async (
			entry: WatchlistCatalogEntry,
		): Promise<LoadedWatchlistMetadata> => {
			const slug = slugOf(entry);
			const [entitiesJsonl, meta] = await Promise.all([
				client.readFile(`${slug}/entities.jsonl`),
				client.readFile(`${slug}/meta.json`),
			]);
			const loaded = buildLoadedWatchlistMetadataFromBundleFiles({
				entitiesJsonl,
				meta,
			});
			if (loaded.version !== entry.version || loaded.listId !== entry.id) {
				throw new WatchlistFormatError(
					`bundle list ${entry.id} metadata skew: catalog ${entry.version}, metadata ${loaded.listId}@${loaded.version}`,
				);
			}
			return loaded;
		};

		return {
			loadCatalog: () => catalog,
			loadList,
			loadListMetadata,
			version: () => result.version,
			clear: async () => {
				try {
					await client.clear();
				} finally {
					client.terminate?.();
				}
			},
		};
	} catch (error) {
		// A failed bootstrap must not strand an OPFS Worker. The runtime retries by
		// dropping this source; terminate the failed client before surfacing the
		// original error so the retry starts with a bounded worker count.
		client.terminate?.();
		throw error;
	}
}
