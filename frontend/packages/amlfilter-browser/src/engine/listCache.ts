// Durable list cache (Theme C) — an IndexedDB byte store for the big, verified
// watchlist artifacts so a cold start is fast and the app works offline.
//
// CRITICAL: this is a BYTE store, NEVER a trust store. It persists the EXACT
// raw artifact bytes + their detached Ed25519 signature; the trust spine
// (verifyEd25519 against the pinned key) is re-run over the CACHED bytes on
// every load by the cache-aware loaders in watchlist.ts. A poisoned cache row
// fails verification and falls through to the (verify-before-parse) network.
//
// SQLite-WASM/OPFS holds the customer + match rows; this IndexedDB store holds
// ONLY the large list blobs — separate stores, separate concerns.
//
// One current version per key: a version bump overwrites the row (trivial
// eviction — the old version's bytes are gone the moment the new ones land).
// The catalog reuses a reserved key (CATALOG_CACHE_KEY) in the same store.

/** The reserved object-store key under which the signed catalog is cached. */
export const CATALOG_CACHE_KEY = "__catalog__";

const DB_NAME = "amlfilter-list-cache";
const DB_VERSION = 1;
const STORE_NAME = "artifacts";

/**
 * One cached artifact: the verified raw bytes + the detached base64 signature,
 * keyed by `key` (a list id, or {@link CATALOG_CACHE_KEY} for the catalog) and
 * stamped with the signed `version` it was fetched at. `cachedAt` is an ISO
 * timestamp for diagnostics only — it is never part of the trust decision.
 */
export interface CachedArtifact {
	readonly key: string;
	readonly version: string;
	readonly bytes: ArrayBuffer;
	readonly signatureBase64: string;
	readonly cachedAt: string;
}

/** The minimal IDBRequest surface we await, typed without `any`. */
interface RequestLike<T> {
	result: T;
	error: DOMException | null;
	onsuccess: (() => void) | null;
	onerror: (() => void) | null;
}

/** The minimal IDBObjectStore surface this module drives. */
interface ObjectStoreLike {
	put(value: CachedArtifact): RequestLike<unknown>;
	get(key: string): RequestLike<CachedArtifact | undefined>;
	delete(key: string): RequestLike<unknown>;
	clear(): RequestLike<unknown>;
	getAllKeys(): RequestLike<ReadonlyArray<IDBValidKey>>;
}

/** The minimal IDBTransaction surface (just the store accessor). */
interface TransactionLike {
	objectStore(name: string): ObjectStoreLike;
}

/** The minimal IDBDatabase surface this module drives. */
interface DatabaseLike {
	transaction(store: string, mode: IDBTransactionMode): TransactionLike;
	close(): void;
}

/** The minimal open-DB request surface, including the upgrade hook. */
interface OpenRequestLike extends RequestLike<DatabaseLike> {
	onupgradeneeded: (() => void) | null;
}

/** Resolve when an IDBRequest settles; reject (fail-closed) on its error. */
function awaitRequest<T>(request: RequestLike<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		request.onsuccess = (): void => resolve(request.result);
		request.onerror = (): void =>
			reject(request.error ?? new Error("IndexedDB request failed"));
	});
}

/**
 * Open (creating/upgrading on first use) the list-cache database. Idempotent
 * per call — callers open once and reuse the handle across reads/writes.
 */
export function openListCache(): Promise<DatabaseLike> {
	return new Promise<DatabaseLike>((resolve, reject) => {
		const request = indexedDB.open(
			DB_NAME,
			DB_VERSION,
		) as unknown as OpenRequestLike & { result: IDBDatabase };
		request.onupgradeneeded = (): void => {
			const db = request.result as unknown as {
				objectStoreNames: DOMStringList;
				createObjectStore(name: string, opts: { keyPath: string }): unknown;
			};
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: "key" });
			}
		};
		request.onsuccess = (): void =>
			resolve(request.result as unknown as DatabaseLike);
		request.onerror = (): void =>
			reject(request.error ?? new Error("opening the list cache failed"));
	});
}

/** Run `body` against the artifacts store in a transaction, closing the db. */
async function withStore<T>(
	mode: IDBTransactionMode,
	body: (store: ObjectStoreLike) => Promise<T>,
): Promise<T> {
	const db = await openListCache();
	try {
		const store = db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
		return await body(store);
	} finally {
		db.close();
	}
}

/**
 * Persist (overwriting any prior version for the same key) a verified artifact.
 * `keyPath: "key"` makes the put an upsert, so a version bump evicts the old
 * bytes in the same write — the single-current-version invariant.
 */
export async function writeArtifact(entry: CachedArtifact): Promise<void> {
	await withStore("readwrite", async (store) => {
		await awaitRequest(store.put(entry));
	});
}

/** Read the cached artifact for `key`, or null on a miss. */
export function readArtifact(key: string): Promise<CachedArtifact | null> {
	return withStore("readonly", async (store) => {
		const got = await awaitRequest(store.get(key));
		return got ?? null;
	});
}

/** Delete the cached artifact for `key` (a no-op on a miss). */
export async function deleteArtifact(key: string): Promise<void> {
	await withStore("readwrite", async (store) => {
		await awaitRequest(store.delete(key));
	});
}

/** Every cached key (list ids + the catalog key), in store order. */
export function listCached(): Promise<ReadonlyArray<string>> {
	return withStore("readonly", async (store) => {
		const keys = await awaitRequest(store.getAllKeys());
		return keys.map((k) => String(k));
	});
}

/** Drop every cached artifact — the "Clear cached lists" affordance. */
export async function clearAll(): Promise<void> {
	await withStore("readwrite", async (store) => {
		await awaitRequest(store.clear());
	});
}
