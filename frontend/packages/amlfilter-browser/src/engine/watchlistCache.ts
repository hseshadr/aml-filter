// Cache-aware load (Theme C) — sits over the fail-closed network loaders
// (watchlist.ts) and the durable byte cache (listCache.ts) so a cold start is
// fast and the app works offline, WITHOUT weakening the trust spine.
//
// The invariant that makes this safe: the cache is a BYTE store, never a trust
// store. verifyEd25519 runs over the bytes — cached OR fetched — on EVERY load,
// against the pinned key (verifyAndParse). So:
//   - Catalog: try the network (no-store); on success, cache the verified bytes.
//     On a network FAILURE, fall back to the cached catalog bytes → re-verify
//     fail-closed → parse (the offline path). Neither works → throw.
//   - Per list: a cache hit whose version matches the SIGNED catalog entry is
//     re-verified over the cached bytes, then parsed + built — no network. A
//     verify failure on cached bytes, a cache miss, or a version mismatch →
//     network loadList (verify-before-parse) → cache the verified bytes.
//
// A tampered cache row fails verification and falls through to the network; a
// poisoned cache can never serve unverified bytes to the scorer.

import {
	CATALOG_CACHE_KEY,
	type CachedArtifact,
	readArtifact,
	writeArtifact,
} from "./listCache";
import {
	assertCatalogShape,
	assertPlausibleArtifactSize,
	buildLoadedWatchlist,
	CATALOG_PATH,
	fetchArtifact,
	type LoadedWatchlist,
	listWatchlistPath,
	type VerifiableArtifact,
	verifyAndParse,
	type Watchlist,
	type WatchlistCatalog,
	type WatchlistCatalogEntry,
} from "./watchlist";

/**
 * The network seams the cache-aware loaders depend on, defaulted to the real
 * same-origin fetchers. `loadCatalog` is the parsed + shape-checked catalog (the
 * existing fail-closed loader); `loadCatalogArtifact` / `loadListArtifact` fetch
 * the RAW bytes + detached signature (UNVERIFIED) so the verified bytes can be
 * cached. Injectable so the unit tests drive deterministic bytes with no fetch.
 */
export interface NetworkLoaders {
	readonly loadCatalogArtifact: () => Promise<VerifiableArtifact>;
	readonly loadListArtifact: (
		entry: WatchlistCatalogEntry,
	) => Promise<VerifiableArtifact>;
}

/** The production loaders: same-origin no-store fetch of the raw signed bytes. */
export const defaultNetworkLoaders: NetworkLoaders = {
	loadCatalogArtifact: () => fetchArtifact(CATALOG_PATH),
	loadListArtifact: (entry) => fetchArtifact(listWatchlistPath(entry)),
};

const NOW = (): string => new Date().toISOString();

/** Persist a verified artifact's bytes + signature under `key` at `version`. */
async function cacheArtifact(
	key: string,
	version: string,
	artifact: VerifiableArtifact,
): Promise<void> {
	const entry: CachedArtifact = {
		key,
		version,
		bytes: artifact.bytes.slice().buffer,
		signatureBase64: artifact.signatureBase64,
		cachedAt: NOW(),
	};
	await writeArtifact(entry);
}

/** Verify + shape-check catalog bytes (cached or fetched) fail-closed. */
async function verifyCatalog(
	bytes: Uint8Array,
	signatureBase64: string,
	pubkey: Uint8Array,
): Promise<WatchlistCatalog> {
	const catalog = await verifyAndParse<WatchlistCatalog>(
		bytes,
		signatureBase64,
		pubkey,
	);
	assertCatalogShape(catalog);
	return catalog;
}

/**
 * Load the signed catalog cache-aware: network first (no-store), caching the
 * verified bytes on success; on a network FAILURE, fall back to the cached
 * catalog bytes, re-verified fail-closed (the offline path). If neither the
 * network nor a valid cached catalog is available, throws.
 */
export async function loadCatalogCached(
	pubkey: Uint8Array,
	loaders: NetworkLoaders = defaultNetworkLoaders,
): Promise<WatchlistCatalog> {
	try {
		const artifact = await loaders.loadCatalogArtifact();
		const catalog = await verifyCatalog(
			artifact.bytes,
			artifact.signatureBase64,
			pubkey,
		);
		await cacheArtifact(CATALOG_CACHE_KEY, catalog.generatedAt, artifact);
		return catalog;
	} catch (networkError) {
		return loadCatalogFromCache(pubkey, networkError);
	}
}

/** Offline fallback: re-verify (fail-closed) the cached catalog, or rethrow the
 * original network error when there is nothing trustworthy to fall back to. */
async function loadCatalogFromCache(
	pubkey: Uint8Array,
	networkError: unknown,
): Promise<WatchlistCatalog> {
	const cached = await readArtifact(CATALOG_CACHE_KEY);
	if (cached === null) {
		throw networkError;
	}
	return verifyCatalog(
		new Uint8Array(cached.bytes),
		cached.signatureBase64,
		pubkey,
	);
}

/** Verify cached list bytes, size-check, and build — or null if verify fails
 * (a poisoned/corrupt row must not abort the load; it falls through to network). */
async function tryCachedList(
	cached: CachedArtifact,
	entry: WatchlistCatalogEntry,
	pubkey: Uint8Array,
): Promise<LoadedWatchlist | null> {
	try {
		assertPlausibleArtifactSize(cached.bytes.byteLength, entry.entitiesCount);
		const watchlist = await verifyAndParse<Watchlist>(
			new Uint8Array(cached.bytes),
			cached.signatureBase64,
			pubkey,
		);
		return buildLoadedWatchlist(watchlist);
	} catch {
		return null;
	}
}

/** Fetch + verify the list over the network (verify-before-parse), size-check,
 * cache the verified bytes, and build. The fail-closed network path. */
async function loadListFromNetwork(
	pubkey: Uint8Array,
	entry: WatchlistCatalogEntry,
	loaders: NetworkLoaders,
): Promise<LoadedWatchlist> {
	const artifact = await loaders.loadListArtifact(entry);
	assertPlausibleArtifactSize(artifact.bytes.byteLength, entry.entitiesCount);
	const watchlist = await verifyAndParse<Watchlist>(
		artifact.bytes,
		artifact.signatureBase64,
		pubkey,
	);
	const loaded = buildLoadedWatchlist(watchlist);
	await cacheArtifact(entry.id, entry.version, artifact);
	return loaded;
}

/**
 * Load ONE list cache-aware. A cached row whose version matches the SIGNED
 * catalog entry's version is re-verified over the cached bytes (fail-closed) and
 * built — no network. A verify failure on cached bytes, a cache miss, or a
 * version mismatch falls through to the fail-closed network load, which caches
 * the verified bytes. verifyEd25519 runs over the served bytes either way.
 */
export async function loadListCached(
	pubkey: Uint8Array,
	entry: WatchlistCatalogEntry,
	loaders: NetworkLoaders = defaultNetworkLoaders,
): Promise<LoadedWatchlist> {
	const cached = await readArtifact(entry.id);
	if (cached !== null && cached.version === entry.version) {
		const loaded = await tryCachedList(cached, entry, pubkey);
		if (loaded !== null) {
			return loaded;
		}
	}
	return loadListFromNetwork(pubkey, entry, loaders);
}
