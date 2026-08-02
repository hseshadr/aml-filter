// TS port of edgeproc.bundles.sync.sync_index — the same numbered state machine
// against a CacheStore, transport injected as fetchBytes and signature checks as
// verify. Fail-closed: any integrity/signature failure throws and promotes nothing.

import { canonicalBytes, type JsonValue } from "../canonical";
import { sha256Hex } from "../crypto";
import { NetworkError } from "./fetchBytes";
import { IntegrityError } from "./integrity";
import { type EstimateStorage, fitsInQuota, QuotaError } from "./storage";
import type {
	CacheStore,
	FetchBytes,
	FileEntry,
	IndexManifest,
	OnSyncProgress,
	SyncResult,
	Verify,
	VersionPointer,
} from "./types";

interface SyncArgs {
	readonly baseUrl: string;
	readonly store: CacheStore;
	readonly fetchBytes: FetchBytes;
	readonly verify: Verify;
	/**
	 * Optional storage-quota seam (production: `navigator.storage.estimate`).
	 * When present, a preflight refuses fail-fast with a {@link QuotaError} if the
	 * device can't hold the chunks about to be fetched — instead of downloading
	 * tens of MB only for the first OPFS write to throw deep in the Worker. Absent
	 * = no preflight (the write path still fails closed on a real quota error).
	 */
	readonly estimateStorage?: EstimateStorage;
	/** Optional per-chunk download progress sink (see {@link OnSyncProgress}).
	 * Fires once per fetched chunk so the boot banner can show n/total instead of
	 * looking frozen; a warm re-sync fetches nothing and emits nothing. */
	readonly onProgress?: OnSyncProgress;
	/** Cross-tab exclusive section for the final active-pointer re-check and
	 * promotion. Production supplies a bounded Web Lock; pure tests may omit it. */
	readonly promoteExclusive?: <T>(operation: () => Promise<T>) => Promise<T>;
	/** Backoff delay seam for the per-chunk retry. Production uses a real timer;
	 * tests pass a no-op so the retry budget is asserted without real waits. */
	readonly sleep?: (ms: number) => Promise<void>;
	/**
	 * Restrict this sync to part of the bundle. An entry matches a manifest file
	 * whose path equals it, or — when the entry ends in `/` — whose path starts
	 * with it. OMITTED MEANS EVERY FILE, so every existing caller is unchanged.
	 *
	 * This exists because /screen's default selection is OFAC SDN alone, while the
	 * published bundle carries four lists in sibling directories. Without a scope
	 * the cold boot pulled all four: 1,296 chunks / 46,714,573 bytes measured
	 * against the live 2026-08-01 bundle, of which 527 chunks / 18.4 MB were for
	 * lists the page never reads.
	 *
	 * A scope narrows WHAT is fetched. It must never narrow HOW anything is
	 * checked — see {@link scopedFiles} for the single walk every check shares.
	 */
	readonly wantedPaths?: ReadonlyArray<string>;
}

const DECODER = new TextDecoder();
const MAX_CONCURRENT_CHUNK_FETCHES = 8;

/**
 * Per-chunk retry budget for the cold sync.
 *
 * A cold sync of the production bundle is ~1,296 independent chunk requests
 * fanned out 8 at a time. With a single attempt each, ONE transient failure
 * anywhere in that fan aborts the entire sync and shows a first-time visitor a
 * Retry banner — at a 0.1% per-request failure rate that is a ~73% chance of a
 * failed first boot. Retrying with exponential backoff turns a blip into a
 * pause instead of a dead end.
 *
 * WHY SIX AND NOT THREE. The budget that matters is SECONDS OF OUTAGE ABSORBED,
 * not attempts taken. Three attempts absorb only 750–1250 ms, and a 3-second
 * offline blip — a wifi/cell handover, a lift, a tunnel — was measured stranding
 * the boot 0/5 against the live site on 2026-08-01: the ladder expired ~1.9 s
 * before the network came back. Six attempts absorb 7.75–9.0 s
 * ({@link MAX_CHUNK_RETRY_BUDGET_MS}), roughly 2.5× the blip actually observed.
 *
 * WHAT IT COSTS SOMEONE GENUINELY OFFLINE. A retry pause is silence, so the
 * ceiling is bounded from above by the engine client's 30 s no-progress
 * watchdog: overshoot it and a blip the ladder was about to absorb would instead
 * tear the whole engine client down. 9 s worst case leaves 21 s of headroom.
 * A visitor who is offline BEFORE the boot starts is unaffected — the `/latest`
 * pointer fetch has no ladder and fails immediately. The cost lands only on a
 * visitor who loses the network MID-download: they wait ~9 s instead of ~1 s for
 * the Retry banner. That is the trade — 8 extra seconds of "please wait" for the
 * offline user, in exchange for the mid-download blip no longer being terminal.
 *
 * This sits strictly BELOW every verification boundary: the pointer signature
 * was checked before any chunk was requested, and `putChunkCompressed` still
 * content-address-verifies each chunk before it lands. Only NetworkError is
 * retried (see {@link isRetriableFetchFailure}).
 */
const CHUNK_FETCH_ATTEMPTS = 6;
const CHUNK_RETRY_BASE_DELAY_MS = 250;

/**
 * Worst-case outage this ladder absorbs, in milliseconds — the number that
 * actually decides whether a blip is a pause or a dead end.
 *
 * Gap i (1-based) waits `base * 2^(i-1)` plus up to `base` of jitter, over
 * `attempts - 1` gaps: `base * (2^(attempts-1) - 1) + base * (attempts - 1)`.
 * Exported because it is an INVARIANT, not a detail: it must stay under the
 * engine client's no-progress watchdog (a retry pause is silence on the
 * `sync-progress` channel) and above the outage a real visitor hits.
 */
export const MAX_CHUNK_RETRY_BUDGET_MS =
	CHUNK_RETRY_BASE_DELAY_MS * (2 ** (CHUNK_FETCH_ATTEMPTS - 1) - 1) +
	CHUNK_RETRY_BASE_DELAY_MS * (CHUNK_FETCH_ATTEMPTS - 1);

const realSleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Only an unreachable origin is worth re-requesting.
 *
 * An IntegrityError means the returned bytes did not hash to the content
 * address we asked for; the address is immutable, so a retry either returns the
 * same bad bytes or lets a tampering origin keep trying until it gets lucky.
 * SignatureError and RollbackError are likewise verdicts, not blips. Retrying
 * any of them would convert a fail-closed check into a retry loop.
 */
function isRetriableFetchFailure(error: unknown): boolean {
	return error instanceof NetworkError;
}

/** Fetch one chunk, absorbing transient transport failures within the budget. */
async function fetchChunkWithRetry(
	url: string,
	fetchBytes: FetchBytes,
	sleep: (ms: number) => Promise<void>,
): Promise<Uint8Array> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= CHUNK_FETCH_ATTEMPTS; attempt += 1) {
		try {
			return await fetchBytes(url);
		} catch (error) {
			if (!isRetriableFetchFailure(error)) {
				throw error;
			}
			lastError = error;
			if (attempt < CHUNK_FETCH_ATTEMPTS) {
				// Exponential backoff with jitter so 8 pooled workers that all trip
				// on the same blip do not resynchronize into a thundering retry.
				const backoff = CHUNK_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
				await sleep(backoff + Math.random() * CHUNK_RETRY_BASE_DELAY_MS);
			}
		}
	}
	throw lastError;
}

/**
 * A signature-valid pointer whose monotonic `sequence` would move the active
 * version BACKWARD — a rollback/replay of an older signed bundle. Thrown
 * fail-closed: it promotes nothing and (unlike a NetworkError) never falls back
 * to a cached version, so a replayed pointer cannot downgrade the watchlist.
 */
export class RollbackError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = "RollbackError";
	}
}

/**
 * True when promoting `incoming` over the current `active` would roll the
 * watchlist backward. When the active pointer carries a monotonic `sequence`, a
 * strictly-lower incoming sequence — or a MISSING one (a pre-versioning pointer
 * replayed over a versioned chain) — is a rollback. A sequence-less active
 * (legacy first sync) has no ordering to compare against, so the first upgrade to
 * a versioned pointer is allowed; an equal sequence is an idempotent re-sync.
 */
function isRollback(active: VersionPointer, incoming: VersionPointer): boolean {
	if (active.sequence === undefined) {
		return false;
	}
	if (incoming.sequence === undefined) {
		return true;
	}
	if (incoming.sequence !== active.sequence) {
		return incoming.sequence < active.sequence;
	}
	// Equality is idempotent only for the SAME signed pointer identity. Without
	// this check, a workflow rerun (or replay) could reuse a sequence for different
	// bytes and later roll between them without crossing the monotonic guard.
	return !(
		incoming.manifest_hash === active.manifest_hash &&
		incoming.version === active.version &&
		(incoming.bundle_id ?? null) === (active.bundle_id ?? null) &&
		(incoming.channel ?? null) === (active.channel ?? null)
	);
}

function assertNotRollback(
	active: VersionPointer | null,
	incoming: VersionPointer,
): void {
	if (active === null || !isRollback(active, incoming)) {
		return;
	}
	throw new RollbackError(
		`refusing to promote version "${incoming.version}" (sequence ${String(
			incoming.sequence,
		)}) over active sequence ${String(active.sequence)} — rollback rejected`,
	);
}

function immediately<T>(operation: () => Promise<T>): Promise<T> {
	return operation();
}

function parseJson<T>(bytes: Uint8Array): T {
	return JSON.parse(DECODER.decode(bytes)) as T;
}

function assertVersionPointer(value: unknown): asserts value is VersionPointer {
	const pointer = value as Partial<VersionPointer> | null;
	if (
		pointer === null ||
		typeof pointer !== "object" ||
		typeof pointer.manifest_hash !== "string" ||
		typeof pointer.version !== "string" ||
		typeof pointer.signature !== "string"
	) {
		throw new IntegrityError(
			"signed latest pointer is missing manifest_hash/version/signature",
		);
	}
	if (
		!Number.isSafeInteger(pointer.sequence) ||
		(pointer.sequence as number) < 0
	) {
		throw new IntegrityError(
			"signed latest pointer is missing a non-negative monotonic sequence",
		);
	}
}

function pointerSigningBytes(pointer: VersionPointer): Uint8Array {
	return canonicalBytes(pointer as unknown as JsonValue, {
		exclude: {
			signature: true,
			bundle_id: pointer.bundle_id == null,
			channel: pointer.channel == null,
		},
	});
}

/** Fetch `/latest` and verify its detached signature (fail-closed). The `/latest`
 * version pointer is MUTABLE, so it is fetched with `cache: "no-store"`: a stale
 * (or cross-project) pointer left in the browser HTTP cache would otherwise be
 * re-read and fail signature verification against the pinned key — a failure even
 * Retry cannot clear, since Retry re-reads the same cached bytes. The immutable
 * `manifest/<hash>` + `chunk/<hash>` fetches are content-addressed (hash in the
 * URL) and stay cacheable; OPFS dedupes them anyway. */
async function fetchPointer(
	baseUrl: string,
	fetchBytes: FetchBytes,
	verify: Verify,
): Promise<VersionPointer> {
	const pointer = parseJson<unknown>(
		await fetchBytes(`${baseUrl}/latest`, { cache: "no-store" }),
	);
	assertVersionPointer(pointer);
	const message = pointerSigningBytes(pointer);
	await verify(message, pointer.signature);
	return pointer;
}

/** Fetch the manifest, verify it hashes to the pointer, parse + cache it. */
async function fetchManifest(
	baseUrl: string,
	pointer: VersionPointer,
	fetchBytes: FetchBytes,
	store: CacheStore,
): Promise<IndexManifest> {
	const raw = await fetchBytes(`${baseUrl}/manifest/${pointer.manifest_hash}`);
	if ((await sha256Hex(raw)) !== pointer.manifest_hash) {
		throw new IntegrityError(
			`manifest ${pointer.manifest_hash} failed content-address check`,
		);
	}
	await store.putManifest(raw);
	return parseJson<IndexManifest>(raw);
}

/**
 * The manifest files this sync is responsible for.
 *
 * EVERY walk over `manifest.files` goes through here — the missing-chunk diff,
 * the reused-chunk verification, the quota preflight, the offline reassembly
 * check, and the cached-result chunk count. That is the point: five walks that
 * each decided membership for themselves would be five chances to drift, and a
 * drift between "what I fetched" and "what I verified" is exactly the kind of
 * gap that promotes an unverified chunk.
 *
 * An undefined scope returns every file, so the default path is byte-identical
 * to the pre-scoping behavior.
 */
function scopedFiles(
	manifest: IndexManifest,
	wantedPaths: ReadonlyArray<string> | undefined,
): ReadonlyArray<FileEntry> {
	if (wantedPaths === undefined) {
		return manifest.files;
	}
	return manifest.files.filter((entry) =>
		wantedPaths.some((wanted) =>
			wanted.endsWith("/")
				? entry.path.startsWith(wanted)
				: entry.path === wanted,
		),
	);
}

/** Return [chunks to fetch, reused count] over the manifest's deduped chunk set. */
async function missingChunks(
	files: ReadonlyArray<FileEntry>,
	store: CacheStore,
): Promise<{
	readonly missing: ReadonlyArray<string>;
	readonly reused: number;
}> {
	const wanted = new Set<string>();
	for (const entry of files) {
		for (const ref of entry.chunks) {
			wanted.add(ref.hash);
		}
	}
	const missing: string[] = [];
	for (const hash of wanted) {
		if (!(await store.hasChunk(hash))) {
			missing.push(hash);
		}
	}
	return { missing, reused: wanted.size - missing.length };
}

/** Fetch + verbatim-ingest each missing chunk (fail-closed); return bytes fetched.
 * Emits progress once per fetched chunk (n/total, cumulative bytes) so the boot
 * banner shows life on the long cold-sync phase. */
async function fetchMissing(
	baseUrl: string,
	missing: ReadonlyArray<string>,
	fetchBytes: FetchBytes,
	store: CacheStore,
	onProgress?: OnSyncProgress,
	sleep: (ms: number) => Promise<void> = realSleep,
): Promise<number> {
	let nextIndex = 0;
	// Shared across the worker pool: total chunks + bytes completed so far.
	let fetched = 0;
	let totalBytes = 0;
	const fetchNext = async (): Promise<number> => {
		let workerBytes = 0;
		while (nextIndex < missing.length) {
			const chunkHash = missing[nextIndex];
			nextIndex += 1;
			if (chunkHash === undefined) {
				break;
			}
			const compressed = await fetchChunkWithRetry(
				`${baseUrl}/chunk/${chunkHash}`,
				fetchBytes,
				sleep,
			);
			await store.putChunkCompressed(chunkHash, compressed);
			workerBytes += compressed.byteLength;
			fetched += 1;
			totalBytes += compressed.byteLength;
			onProgress?.({ fetched, total: missing.length, bytes: totalBytes });
		}
		return workerBytes;
	};
	const workers = Array.from(
		{ length: Math.min(MAX_CONCURRENT_CHUNK_FETCHES, missing.length) },
		fetchNext,
	);
	// allSettled, not all: `Promise.all` would reject the instant the FIRST
	// worker exhausts its retry ladder, leaving the other seven fetching and
	// retrying against a network that is still down. Their eventual rejections
	// would have nobody left to catch them — unhandled rejections in the
	// visitor's console — and their requests would fire after the boot had
	// already given up. Waiting for every worker costs nothing extra in the case
	// that matters (during an outage they are all failing together, inside the
	// same retry budget) and guarantees no fetch outlives the sync.
	const settled = await Promise.allSettled(workers);
	const failure = settled.find((outcome) => outcome.status === "rejected");
	if (failure !== undefined) {
		// Fail closed on the first worker's cause, exactly as Promise.all did.
		throw failure.reason;
	}
	return settled.reduce(
		(total, outcome) =>
			total + (outcome.status === "fulfilled" ? outcome.value : 0),
		0,
	);
}

function concat(parts: ReadonlyArray<Uint8Array>): Uint8Array {
	const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.byteLength;
	}
	return out;
}

async function reassemble(
	entry: FileEntry,
	store: CacheStore,
): Promise<Uint8Array> {
	const parts: Uint8Array[] = [];
	for (const ref of entry.chunks) {
		parts.push(await store.getChunk(ref.hash));
	}
	const blob = concat(parts);
	if ((await sha256Hex(blob)) !== entry.file_sha256) {
		throw new IntegrityError(`file ${entry.path} failed reassembly check`);
	}
	return blob;
}

/**
 * Read every REUSED chunk once so a corrupt one already in the store is caught
 * (and self-healed) before promotion. `getChunk` decompresses + verifies the
 * content-address and evicts a poisoned entry on failure (the 2026-07-13 outage
 * fix), so this is what keeps a stale bad chunk from being promoted — WITHOUT
 * reassembling whole files in RAM the way verifyReassembly does (the cold-boot
 * memory win). Freshly-fetched chunks are skipped: putChunkCompressed already
 * verified them on write, so re-reading them would be pure redundant work. Each
 * distinct chunk is read at most once. Fail-closed: a bad chunk throws here,
 * before promote.
 */
async function verifyReusedChunks(
	files: ReadonlyArray<FileEntry>,
	missing: ReadonlyArray<string>,
	store: CacheStore,
): Promise<void> {
	const fetched = new Set(missing);
	const seen = new Set<string>();
	for (const entry of files) {
		for (const ref of entry.chunks) {
			if (fetched.has(ref.hash) || seen.has(ref.hash)) {
				continue;
			}
			seen.add(ref.hash);
			await store.getChunk(ref.hash);
		}
	}
}

/** Reassembly-on-read check: each file's chunks concat to its file_sha256. Used
 * on the OFFLINE fallback path (syncFromCache), which re-serves cached bytes not
 * re-verified on write this run, so it re-verifies them fail-closed. */
async function verifyReassembly(
	files: ReadonlyArray<FileEntry>,
	store: CacheStore,
): Promise<void> {
	for (const entry of files) {
		await reassemble(entry, store);
	}
}

/** Sum the (uncompressed) sizes of the chunks about to be fetched. An upper
 * bound on the OPFS bytes the sync will add — chunks are stored compressed, so
 * this over-estimates, keeping the quota preflight conservative (it never
 * under-warns). */
function neededBytes(
	files: ReadonlyArray<FileEntry>,
	missing: ReadonlyArray<string>,
): number {
	const wanted = new Set(missing);
	const sizeOf = new Map<string, number>();
	for (const entry of files) {
		for (const ref of entry.chunks) {
			if (wanted.has(ref.hash)) {
				sizeOf.set(ref.hash, ref.size);
			}
		}
	}
	let total = 0;
	for (const size of sizeOf.values()) {
		total += size;
	}
	return total;
}

/** Fail-fast quota preflight (best-effort): refuse before fetching if the device
 * can't hold the missing chunks. A no-op when no estimate seam is wired or the
 * browser can't report quota/usage. */
async function assertRoomForChunks(
	files: ReadonlyArray<FileEntry>,
	missing: ReadonlyArray<string>,
	estimateStorage: EstimateStorage | undefined,
): Promise<void> {
	if (estimateStorage === undefined || missing.length === 0) {
		return;
	}
	const needed = neededBytes(files, missing);
	const estimate = await estimateStorage();
	if (!fitsInQuota(estimate, needed)) {
		const mb = Math.ceil(needed / 1_000_000);
		throw new QuotaError(
			`not enough free storage on this device to load the sanctions list ` +
				`(needs about ${mb} MB) — free up space or use a desktop browser`,
		);
	}
}

/** Count the distinct chunk hashes a manifest references (for the cache result). */
function distinctChunks(files: ReadonlyArray<FileEntry>): number {
	const seen = new Set<string>();
	for (const entry of files) {
		for (const ref of entry.chunks) {
			seen.add(ref.hash);
		}
	}
	return seen.size;
}

/**
 * Offline fallback: the pointer fetch was network-unreachable. If a previously
 * promoted active version + its manifest are already cached, serve THAT version
 * (0 fetched, all reused) instead of failing. Returns null when no usable cache
 * exists, so the caller re-throws the original network error. Fail-closed: this
 * path runs ONLY for a NetworkError — integrity/signature failures never reach
 * here, so a tampered-but-present pointer still throws.
 */
async function syncFromCache(
	store: CacheStore,
	wantedPaths: ReadonlyArray<string> | undefined,
): Promise<SyncResult | null> {
	const active = await store.readActive();
	if (active === null) {
		return null;
	}
	const raw = await store.getManifest(active.manifest_hash);
	const manifest = parseJson<IndexManifest>(raw);
	// Scoped: a list that was never fetched has no chunks to reassemble, so an
	// unscoped walk here would turn a perfectly good offline boot into a spurious
	// integrity failure. What IS in scope is still fully re-verified.
	const files = scopedFiles(manifest, wantedPaths);
	await verifyReassembly(files, store);
	return {
		version: active.version,
		manifestHash: active.manifest_hash,
		chunksFetched: 0,
		chunksReused: distinctChunks(files),
		bytesFetched: 0,
	};
}

/** Pull a signed pointer, diff + fetch missing chunks, verify, atomically promote. */
export async function syncIndex(args: SyncArgs): Promise<SyncResult> {
	const { baseUrl, store, fetchBytes, verify } = args;
	let pointer: VersionPointer;
	try {
		pointer = await fetchPointer(baseUrl, fetchBytes, verify);
	} catch (error) {
		// Only network-unreachable triggers the cached-version fallback. A present
		// but invalid pointer (bad signature) is an IntegrityError-class failure
		// and must propagate, promoting nothing.
		if (error instanceof NetworkError) {
			const cached = await syncFromCache(store, args.wantedPaths);
			if (cached !== null) {
				return cached;
			}
		}
		throw error;
	}
	// Anti-rollback gate: a verified pointer must never move the active version
	// backward. Checked BEFORE any manifest/chunk fetch so a replayed downgrade
	// costs nothing and promotes nothing (fail-closed).
	const active = await store.readActive();
	assertNotRollback(active, pointer);
	const manifest = await fetchManifest(baseUrl, pointer, fetchBytes, store);
	// The one place the scope is applied. Everything downstream — the diff, the
	// preflight, the fetch, the reused-chunk verification, the reported counts —
	// works off this same list, so "fetched" and "verified" cannot drift apart.
	const files = scopedFiles(manifest, args.wantedPaths);
	const { missing, reused } = await missingChunks(files, store);
	// Quota preflight: refuse fail-fast (QuotaError) before fetching any chunk if
	// the device can't hold them. Best-effort — a no-op without an estimate seam.
	await assertRoomForChunks(files, missing, args.estimateStorage);
	const bytesFetched = await fetchMissing(
		baseUrl,
		missing,
		fetchBytes,
		store,
		args.onProgress,
		args.sleep,
	);
	// Fresh path: verify only the REUSED chunks (self-healing a poisoned present
	// chunk), NOT a full verifyReassembly. The old eager pass reassembled + hashed
	// EVERY file in RAM at boot, then materializeFile did it a SECOND time per file
	// — doubling the peak on the memory-tight cold path (the iOS killer). Dropping
	// it keeps fail-closed intact: fetched chunks were verified on write, reused
	// chunks are verified here, and each file's sha256 is checked once at
	// materialize BEFORE its bytes are used.
	await verifyReusedChunks(files, missing, store);
	// The optimistic gate above avoids needless bundle work for an obvious replay.
	// Re-read under the cross-tab promotion lock immediately before the write: a
	// newer tab may have promoted while this tab downloaded and verified chunks.
	const promoteExclusive = args.promoteExclusive ?? immediately;
	await promoteExclusive(async () => {
		assertNotRollback(await store.readActive(), pointer);
		await store.promote(pointer);
	});
	return {
		version: pointer.version,
		manifestHash: pointer.manifest_hash,
		chunksFetched: missing.length,
		chunksReused: reused,
		bytesFetched,
	};
}

function fileEntry(manifest: IndexManifest, path: string): FileEntry {
	for (const entry of manifest.files) {
		if (entry.path === path) {
			return entry;
		}
	}
	throw new Error(`file ${path} not in manifest`);
}

/** Reassemble a synced file's bytes on demand from its chunks (fail-closed). */
export async function materializeFile(
	store: CacheStore,
	manifest: IndexManifest,
	path: string,
): Promise<Uint8Array> {
	return reassemble(fileEntry(manifest, path), store);
}
