// TS mirrors of edge-proc's bundle models (edgeproc/bundles/manifest.py).
// Interface-over-type for object shapes; the JSON wire format is identical
// across the native (Python) and browser tiers — this is the same manifest.

/** One content-defined chunk: `hash` is the bare hex sha256 of its plaintext. */
export interface ChunkRef {
	readonly hash: string;
	/** Uncompressed chunk length in bytes. */
	readonly size: number;
}

/** A file as an ordered list of chunks (order = reassembly order). */
export interface FileEntry {
	readonly path: string;
	readonly file_type: string | null;
	/** Total uncompressed file length. */
	readonly size: number;
	/** Bare hex sha256 of the whole reassembled file. */
	readonly file_sha256: string;
	readonly chunks: ReadonlyArray<ChunkRef>;
}

/** v2 chunked manifest; authenticated by its content hash, not an embedded sig. */
export interface IndexManifest {
	readonly schema_version: number;
	readonly bundle_id: string;
	readonly version: string;
	readonly files: ReadonlyArray<FileEntry>;
	readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

/** Signed pointer to a manifest; `signature` is detached over the rest. */
export interface VersionPointer {
	/** Hex sha256 of the manifest's canonical bytes. */
	readonly manifest_hash: string;
	readonly version: string;
	/** Optional edge-proc identity binding fields. Null is excluded from the
	 * signature preimage for compatibility with legacy pointers. */
	readonly bundle_id?: string | null;
	readonly channel?: string | null;
	/**
	 * Monotonic anti-rollback counter: a publish increments it, and the sync tier
	 * rejects any signature-valid pointer whose `sequence` is lower than the active
	 * version's (see `syncIndex`). Required on every incoming pointer after the
	 * production migration; a cached legacy active pointer may still upgrade once
	 * to this sequenced chain. It is part of the signed canonical bytes.
	 */
	readonly sequence: number;
	/** ed25519 over canonicalBytes(self, exclude {signature}), base64. */
	readonly signature: string;
}

/** Outcome of a `syncIndex` run — proves only-changed-chunks were fetched. */
export interface SyncResult {
	readonly version: string;
	readonly manifestHash: string;
	readonly chunksFetched: number;
	readonly chunksReused: number;
	readonly bytesFetched: number;
}

/** Cold-sync download progress, emitted once per fetched chunk. Threaded to the
 * boot banner so the long "Downloading…" phase shows life (n/total chunks)
 * instead of looking frozen — the exact symptom on a slow first visit. */
export interface SyncProgress {
	/** Chunks fetched + verified so far this sync. */
	readonly fetched: number;
	/** Total chunks this sync must fetch (the missing-chunk count). */
	readonly total: number;
	/** Compressed bytes fetched so far. */
	readonly bytes: number;
}

/** A progress sink for the cold-sync download. Optional at every layer — a warm
 * reload fetches no chunks and emits nothing. */
export type OnSyncProgress = (progress: SyncProgress) => void;

/**
 * Local content-addressed store. OPFS, IndexedDB, and in-memory implementations
 * share this surface — the seam edge-proc's `cas.py` `CacheStore` Protocol names.
 */
export interface CacheStore {
	hasChunk(chunkHash: string): Promise<boolean>;
	/** Decompress → sha256 → verify == chunkHash (fail-closed) → store. */
	putChunkCompressed(chunkHash: string, compressed: Uint8Array): Promise<void>;
	/** Read → decompress → verify == chunkHash (fail-closed) → return plaintext. */
	getChunk(chunkHash: string): Promise<Uint8Array>;
	putManifest(manifestBytes: Uint8Array): Promise<string>;
	getManifest(manifestHash: string): Promise<Uint8Array>;
	readActive(): Promise<VersionPointer | null>;
	promote(pointer: VersionPointer): Promise<void>;
	/** Drop EVERY chunk + manifest + the active pointer, leaving an empty but
	 * reusable store (the "Clear cached lists" affordance; next sync re-fetches). */
	clear(): Promise<void>;
}

/** Per-fetch transport options. `cache` mirrors `RequestInit.cache`; the sync
 * engine passes `"no-store"` for the mutable `/latest` pointer so a stale or
 * cross-project entry in the browser HTTP cache can never poison the verify. */
export interface FetchBytesOptions {
	readonly cache?: RequestCache;
}

/** Transport seam: fetch raw bytes for a URL (injectable for tests). */
export type FetchBytes = (
	url: string,
	options?: FetchBytesOptions,
) => Promise<Uint8Array>;

/** Fail-closed ed25519 verifier: resolves on a valid signature, else throws. */
export type Verify = (
	message: Uint8Array,
	signatureBase64: string,
) => Promise<void>;
