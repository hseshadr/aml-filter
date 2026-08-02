import { Zstd } from "@hpcc-js/wasm-zstd";
import { describe, expect, it } from "vitest";
import { sha256Hex, verifyEd25519 } from "../crypto";
import { NetworkError } from "./fetchBytes";
import { latestBytes, originFetch, pubkeyRaw } from "./fixtures";
import { IntegrityError } from "./integrity";
import { MemoryCacheStore } from "./memoryStore";
import { QuotaError } from "./storage";
import { materializeFile, RollbackError, syncIndex } from "./sync";
import type {
	CacheStore,
	FetchBytes,
	IndexManifest,
	Verify,
	VersionPointer,
} from "./types";

const DECODER = new TextDecoder();
const ENCODER = new TextEncoder();
const PUBKEY = pubkeyRaw();

const realVerify: Verify = (message, signature) =>
	verifyEd25519(PUBKEY, message, signature);

function realPointer(): VersionPointer {
	return JSON.parse(DECODER.decode(latestBytes())) as VersionPointer;
}

async function loadManifest(
	store: MemoryCacheStore,
	hash: string,
): Promise<IndexManifest> {
	return JSON.parse(
		DECODER.decode(await store.getManifest(hash)),
	) as IndexManifest;
}

interface SyntheticBundle {
	readonly chunkHashes: ReadonlyArray<string>;
	readonly fetchBytes: FetchBytes;
}

class RecordingCacheStore implements CacheStore {
	readonly #inner = new MemoryCacheStore();
	public readonly verifiedChunks = new Set<string>();
	public chunksAtPromotion: number | null = null;
	public promotionCount = 0;

	public hasChunk(chunkHash: string): Promise<boolean> {
		return this.#inner.hasChunk(chunkHash);
	}

	public async putChunkCompressed(
		chunkHash: string,
		compressed: Uint8Array,
	): Promise<void> {
		await this.#inner.putChunkCompressed(chunkHash, compressed);
		this.verifiedChunks.add(chunkHash);
	}

	public getChunk(chunkHash: string): Promise<Uint8Array> {
		return this.#inner.getChunk(chunkHash);
	}

	public putManifest(manifestBytes: Uint8Array): Promise<string> {
		return this.#inner.putManifest(manifestBytes);
	}

	public getManifest(manifestHash: string): Promise<Uint8Array> {
		return this.#inner.getManifest(manifestHash);
	}

	public readActive(): Promise<VersionPointer | null> {
		return this.#inner.readActive();
	}

	public promote(pointer: VersionPointer): Promise<void> {
		this.promotionCount += 1;
		this.chunksAtPromotion = this.verifiedChunks.size;
		return this.#inner.promote(pointer);
	}

	public clear(): Promise<void> {
		this.verifiedChunks.clear();
		this.chunksAtPromotion = null;
		this.promotionCount = 0;
		return this.#inner.clear();
	}
}

function joinBytes(parts: ReadonlyArray<Uint8Array>): Uint8Array {
	const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
	const joined = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		joined.set(part, offset);
		offset += part.byteLength;
	}
	return joined;
}

async function syntheticBundle(chunkCount: number): Promise<SyntheticBundle> {
	const zstd = await Zstd.load();
	const chunks = new Map<string, Uint8Array>();
	const plaintext: Uint8Array[] = [];
	for (let index = 0; index < chunkCount; index += 1) {
		const bytes = ENCODER.encode(`verified synthetic chunk ${index}`);
		const hash = await sha256Hex(bytes);
		plaintext.push(bytes);
		chunks.set(hash, zstd.compress(bytes));
	}
	const fileBytes = joinBytes(plaintext);
	const manifest: IndexManifest = {
		schema_version: 2,
		bundle_id: "concurrency-test",
		version: "v1",
		files: [
			{
				path: "chunks.bin",
				file_type: null,
				size: fileBytes.byteLength,
				file_sha256: await sha256Hex(fileBytes),
				chunks: await Promise.all(
					plaintext.map(async (bytes) => ({
						hash: await sha256Hex(bytes),
						size: bytes.byteLength,
					})),
				),
			},
		],
		metadata: {},
	};
	const manifestBytes = ENCODER.encode(JSON.stringify(manifest));
	const manifestHash = await sha256Hex(manifestBytes);
	const pointerBytes = ENCODER.encode(
		JSON.stringify({
			manifest_hash: manifestHash,
			version: manifest.version,
			sequence: 1,
			signature: "test-signature",
		} satisfies VersionPointer),
	);
	const fetchBytes: FetchBytes = (url) => {
		if (url.endsWith("/latest")) {
			return Promise.resolve(pointerBytes);
		}
		if (url.endsWith(`/manifest/${manifestHash}`)) {
			return Promise.resolve(manifestBytes);
		}
		const hash = url.split("/").at(-1);
		const compressed = hash === undefined ? undefined : chunks.get(hash);
		if (compressed === undefined) {
			return Promise.reject(new Error(`unexpected ${url}`));
		}
		return Promise.resolve(compressed);
	};
	return { chunkHashes: [...chunks.keys()], fetchBytes };
}

const passVerify: Verify = () => Promise.resolve();

describe("syncIndex bounded chunk concurrency", () => {
	it("fetches chunks in parallel without exceeding eight network requests", async () => {
		const bundle = await syntheticBundle(20);
		const store = new RecordingCacheStore();
		let inFlight = 0;
		let maxInFlight = 0;
		const fetchBytes: FetchBytes = async (url, options) => {
			if (!url.includes("/chunk/")) {
				return bundle.fetchBytes(url, options);
			}
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 5));
			try {
				return await bundle.fetchBytes(url, options);
			} finally {
				inFlight -= 1;
			}
		};

		await syncIndex({ baseUrl: "/o", store, fetchBytes, verify: passVerify });

		expect(maxInFlight).toBeGreaterThan(1);
		expect(maxInFlight).toBeLessThanOrEqual(8);
	});

	it("emits monotonic per-chunk download progress reaching total/total", async () => {
		const bundle = await syntheticBundle(20);
		const store = new RecordingCacheStore();
		const events: Array<{ fetched: number; total: number; bytes: number }> = [];

		await syncIndex({
			baseUrl: "/o",
			store,
			fetchBytes: bundle.fetchBytes,
			verify: passVerify,
			onProgress: (p) => events.push(p),
		});

		// One event per fetched chunk, ending at fetched === total.
		expect(events.length).toBe(bundle.chunkHashes.length);
		const last = events[events.length - 1];
		expect(last).toMatchObject({
			fetched: bundle.chunkHashes.length,
			total: bundle.chunkHashes.length,
		});
		expect(last?.bytes ?? 0).toBeGreaterThan(0);
		// fetched + bytes are monotonically non-decreasing across the pool.
		for (let i = 1; i < events.length; i += 1) {
			const prev = events[i - 1];
			const curr = events[i];
			if (prev === undefined || curr === undefined) {
				continue;
			}
			expect(curr.fetched).toBeGreaterThanOrEqual(prev.fetched);
			expect(curr.bytes).toBeGreaterThanOrEqual(prev.bytes);
		}
	});

	it("emits no progress on a warm re-sync that fetches nothing", async () => {
		const bundle = await syntheticBundle(5);
		const store = new RecordingCacheStore();
		await syncIndex({
			baseUrl: "/o",
			store,
			fetchBytes: bundle.fetchBytes,
			verify: passVerify,
		});
		// Second sync: every chunk is already present, so nothing is fetched.
		const events: unknown[] = [];
		await syncIndex({
			baseUrl: "/o",
			store,
			fetchBytes: bundle.fetchBytes,
			verify: passVerify,
			onProgress: (p) => events.push(p),
		});
		expect(events).toEqual([]);
	});

	it("verifies and stores every chunk before promoting", async () => {
		const bundle = await syntheticBundle(20);
		const store = new RecordingCacheStore();

		const result = await syncIndex({
			baseUrl: "/o",
			store,
			fetchBytes: bundle.fetchBytes,
			verify: passVerify,
		});

		expect(result.chunksFetched).toBe(bundle.chunkHashes.length);
		expect([...store.verifiedChunks].sort()).toEqual(
			[...bundle.chunkHashes].sort(),
		);
		expect(store.chunksAtPromotion).toBe(bundle.chunkHashes.length);
		expect(store.promotionCount).toBe(1);
	});

	it("fails closed without promotion when any chunk fetch fails", async () => {
		const bundle = await syntheticBundle(20);
		const store = new RecordingCacheStore();
		const failedHash = bundle.chunkHashes[3];
		const fetchBytes: FetchBytes = (url, options) => {
			if (failedHash !== undefined && url.endsWith(`/chunk/${failedHash}`)) {
				return Promise.reject(new Error("synthetic chunk fetch failed"));
			}
			return bundle.fetchBytes(url, options);
		};

		await expect(
			syncIndex({ baseUrl: "/o", store, fetchBytes, verify: passVerify }),
		).rejects.toThrow("synthetic chunk fetch failed");
		expect(store.promotionCount).toBe(0);
		expect(await store.readActive()).toBeNull();
	});
});

describe("syncIndex lazy file verification (single reassembly)", () => {
	it("promotes on the fresh path without eagerly reassembling; materialize is the fail-closed file check", async () => {
		// A manifest whose declared file_sha256 does NOT match its (individually
		// valid) chunk. The fresh sync no longer reassembles every file eagerly
		// (that was the double-reassemble the cold boot paid twice), so it PROMOTES;
		// the file-hash check now happens once, at materialize, still fail-closed.
		const zstd = await Zstd.load();
		const chunkPlain = ENCODER.encode("the only chunk");
		const chunkHash = await sha256Hex(chunkPlain);
		const manifest: IndexManifest = {
			schema_version: 2,
			bundle_id: "lazy-verify",
			version: "v1",
			files: [
				{
					path: "f.bin",
					file_type: null,
					size: chunkPlain.byteLength,
					file_sha256: "0".repeat(64), // deliberately wrong
					chunks: [{ hash: chunkHash, size: chunkPlain.byteLength }],
				},
			],
			metadata: {},
		};
		const manifestBytes = ENCODER.encode(JSON.stringify(manifest));
		const manifestHash = await sha256Hex(manifestBytes);
		const pointer: VersionPointer = {
			manifest_hash: manifestHash,
			version: "v1",
			sequence: 1,
			signature: "test-signature",
		};
		const fetchBytes: FetchBytes = (url) => {
			if (url.endsWith("/latest")) {
				return Promise.resolve(ENCODER.encode(JSON.stringify(pointer)));
			}
			if (url.endsWith(`/manifest/${manifestHash}`)) {
				return Promise.resolve(manifestBytes);
			}
			if (url.endsWith(`/chunk/${chunkHash}`)) {
				return Promise.resolve(zstd.compress(chunkPlain));
			}
			return Promise.reject(new Error(`unexpected ${url}`));
		};
		const store = new MemoryCacheStore();

		// Fresh sync promotes — no eager reassembly rejected it.
		await syncIndex({ baseUrl: "/o", store, fetchBytes, verify: passVerify });
		expect(await store.readActive()).not.toBeNull();

		// Materialize is the fail-closed file check: the bad file_sha256 is caught
		// here, before the bytes are ever used.
		const loaded = await loadManifest(store, manifestHash);
		await expect(
			materializeFile(store, loaded, "f.bin"),
		).rejects.toBeInstanceOf(IntegrityError);
	});
});

describe("syncIndex storage preflight", () => {
	it("throws QuotaError without promoting when free space cannot fit the bundle", async () => {
		const bundle = await syntheticBundle(20);
		const store = new RecordingCacheStore();
		// Report almost no free space so the ~600-byte synthetic bundle can't fit.
		const estimateStorage = () => Promise.resolve({ quota: 100, usage: 0 });

		await expect(
			syncIndex({
				baseUrl: "/o",
				store,
				fetchBytes: bundle.fetchBytes,
				verify: passVerify,
				estimateStorage,
			}),
		).rejects.toBeInstanceOf(QuotaError);
		// Fail-fast: nothing was fetched or promoted.
		expect(store.promotionCount).toBe(0);
		expect(store.verifiedChunks.size).toBe(0);
		expect(await store.readActive()).toBeNull();
	});

	it("proceeds when ample free space is reported", async () => {
		const bundle = await syntheticBundle(20);
		const store = new RecordingCacheStore();
		const estimateStorage = () => Promise.resolve({ quota: 10 ** 9, usage: 0 });

		const result = await syncIndex({
			baseUrl: "/o",
			store,
			fetchBytes: bundle.fetchBytes,
			verify: passVerify,
			estimateStorage,
		});
		expect(result.chunksFetched).toBe(bundle.chunkHashes.length);
		expect(store.promotionCount).toBe(1);
	});

	it("is best-effort: proceeds when the browser reports no quota numbers", async () => {
		const bundle = await syntheticBundle(20);
		const store = new RecordingCacheStore();
		const estimateStorage = () => Promise.resolve({});

		const result = await syncIndex({
			baseUrl: "/o",
			store,
			fetchBytes: bundle.fetchBytes,
			verify: passVerify,
			estimateStorage,
		});
		expect(result.chunksFetched).toBe(bundle.chunkHashes.length);
	});
});

describe("syncIndex against the real OFAC bundle fixture", () => {
	it("first run fetches every chunk, reuses none, reassembles byte-correct", async () => {
		const store = new MemoryCacheStore();
		const { fetchBytes } = originFetch();
		const result = await syncIndex({
			baseUrl: "/o",
			store,
			fetchBytes,
			verify: realVerify,
		});

		expect(result.version).toBe("2026-05-30");
		expect(result.chunksReused).toBe(0);
		expect(result.chunksFetched).toBeGreaterThan(0);

		const active = await store.readActive();
		expect(active?.manifest_hash).toBe(result.manifestHash);

		const manifest = await loadManifest(store, result.manifestHash);
		for (const entry of manifest.files) {
			const bytes = await materializeFile(store, manifest, entry.path);
			expect(bytes.byteLength).toBe(entry.size);
		}
	});

	it("re-run against a primed store fetches nothing", async () => {
		const store = new MemoryCacheStore();
		const first = originFetch();
		await syncIndex({
			baseUrl: "/o",
			store,
			fetchBytes: first.fetchBytes,
			verify: realVerify,
		});
		const second = originFetch();
		const result = await syncIndex({
			baseUrl: "/o",
			store,
			fetchBytes: second.fetchBytes,
			verify: realVerify,
		});
		expect(result.chunksFetched).toBe(0);
		expect(second.chunkRequests()).toHaveLength(0);
	});

	it("materializes the bundle's named files (entities + meta + vector)", async () => {
		const store = new MemoryCacheStore();
		const { fetchBytes } = originFetch();
		const result = await syncIndex({
			baseUrl: "/o",
			store,
			fetchBytes,
			verify: realVerify,
		});
		const manifest = await loadManifest(store, result.manifestHash);
		const paths = manifest.files.map((f) => f.path);
		expect(paths).toContain("entities.jsonl");
		expect(paths).toContain("ofac_meta.json");
		expect(paths).toContain("vector/index.faiss");
		expect(paths).toContain("vector/state.json");
	});
});

describe("syncIndex pointer cache control", () => {
	it("fetches the mutable /latest pointer with cache: 'no-store', but not the immutable manifest/chunk fetches", async () => {
		const store = new MemoryCacheStore();
		const origin = originFetch();
		const recorded: { url: string; cache?: RequestCache }[] = [];
		const fetchBytes: FetchBytes = (url, options) => {
			recorded.push({ url, cache: options?.cache });
			return origin.fetchBytes(url);
		};

		await syncIndex({ baseUrl: "/o", store, fetchBytes, verify: realVerify });

		const latest = recorded.find((c) => c.url.endsWith("/latest"));
		expect(latest?.cache).toBe("no-store");

		const others = recorded.filter((c) => !c.url.endsWith("/latest"));
		expect(others.length).toBeGreaterThan(0);
		for (const c of others) {
			expect(c.cache).toBeUndefined();
		}
	});
});

describe("syncIndex fail-closed behavior", () => {
	it("rejects a tampered pointer signature and promotes nothing", async () => {
		const store = new MemoryCacheStore();
		const pointer = realPointer();
		const tampered: VersionPointer = {
			...pointer,
			signature:
				(pointer.signature[0] === "A" ? "B" : "A") + pointer.signature.slice(1),
		};
		const fetchBytes: FetchBytes = (url) => {
			if (url.endsWith("/latest")) {
				return Promise.resolve(
					new TextEncoder().encode(JSON.stringify(tampered)),
				);
			}
			return Promise.reject(new Error(`should not fetch ${url}`));
		};
		await expect(
			syncIndex({ baseUrl: "/o", store, fetchBytes, verify: realVerify }),
		).rejects.toThrow();
		expect(await store.readActive()).toBeNull();
	});

	it("rejects a manifest whose bytes do not hash to the pointer", async () => {
		const store = new MemoryCacheStore();
		const fetchBytes: FetchBytes = (url) => {
			if (url.endsWith("/latest")) {
				return Promise.resolve(latestBytes());
			}
			if (url.includes("/manifest/")) {
				return Promise.resolve(new TextEncoder().encode('{"tampered":true}'));
			}
			return Promise.reject(new Error(`unexpected ${url}`));
		};
		const verify: Verify = () => Promise.resolve();
		await expect(
			syncIndex({ baseUrl: "/o", store, fetchBytes, verify }),
		).rejects.toBeInstanceOf(IntegrityError);
		expect(await store.readActive()).toBeNull();
	});
});

describe("syncIndex rejects a rollback (monotonic version guard)", () => {
	const passVerify: Verify = () => Promise.resolve();

	// An origin whose /latest pointer carries an injected monotonic `sequence`. The
	// pointer bytes are mutated, so signature checking is bypassed with a resolving
	// verify seam — the rollback guard under test is independent of signing.
	function sequencedFetch(
		sequence: number,
		overrides: Partial<VersionPointer> = {},
	): FetchBytes {
		const origin = originFetch();
		return (url) => {
			if (url.endsWith("/latest")) {
				const pointer = JSON.parse(
					DECODER.decode(latestBytes()),
				) as VersionPointer;
				const withSeq = { ...pointer, sequence, ...overrides };
				return Promise.resolve(
					new TextEncoder().encode(JSON.stringify(withSeq)),
				);
			}
			return origin.fetchBytes(url);
		};
	}

	function sequenceLessFetch(): FetchBytes {
		const origin = originFetch();
		return (url) => {
			if (url.endsWith("/latest")) {
				const pointer = realPointer();
				return Promise.resolve(
					ENCODER.encode(
						JSON.stringify({
							manifest_hash: pointer.manifest_hash,
							version: pointer.version,
							signature: pointer.signature,
						}),
					),
				);
			}
			return origin.fetchBytes(url);
		};
	}

	it("promotes a newer sequence, then rejects an older signed pointer, leaving the newer active", async () => {
		const store = new MemoryCacheStore();
		await syncIndex({
			baseUrl: "/o",
			store,
			fetchBytes: sequencedFetch(5),
			verify: passVerify,
		});
		expect((await store.readActive())?.sequence).toBe(5);

		// A signature-valid but OLDER pointer (a replay/downgrade) must be rejected.
		await expect(
			syncIndex({
				baseUrl: "/o",
				store,
				fetchBytes: sequencedFetch(3),
				verify: passVerify,
			}),
		).rejects.toBeInstanceOf(RollbackError);
		// The active watchlist was NOT rolled back to the older version.
		expect((await store.readActive())?.sequence).toBe(5);
	});

	it("rejects a different pointer that reuses the active sequence", async () => {
		const store = new MemoryCacheStore();
		await syncIndex({
			baseUrl: "/o",
			store,
			fetchBytes: sequencedFetch(5),
			verify: passVerify,
		});
		let requests = 0;
		const conflict = sequencedFetch(5, {
			manifest_hash: "f".repeat(64),
			version: "conflicting-replay",
		});

		await expect(
			syncIndex({
				baseUrl: "/o",
				store,
				fetchBytes: (url, options) => {
					requests += 1;
					return conflict(url, options);
				},
				verify: passVerify,
			}),
		).rejects.toBeInstanceOf(RollbackError);
		expect(requests, "collision must stop before manifest/chunk fetch").toBe(1);
		expect((await store.readActive())?.version).not.toBe("conflicting-replay");
	});

	it("re-checks under the promotion lock so a lower-sequence last writer loses", async () => {
		const store = new MemoryCacheStore();
		const newer = { ...realPointer(), sequence: 3 };
		let lockEntries = 0;

		await expect(
			syncIndex({
				baseUrl: "/o",
				store,
				fetchBytes: sequencedFetch(2),
				verify: passVerify,
				promoteExclusive: async (operation) => {
					lockEntries += 1;
					// Models a concurrent tab that promoted sequence 3 after this sync's
					// optimistic pre-check but before sequence 2 reached the lock.
					await store.promote(newer);
					return operation();
				},
			}),
		).rejects.toBeInstanceOf(RollbackError);
		expect(lockEntries).toBe(1);
		expect((await store.readActive())?.sequence).toBe(3);
	});

	it("rejects a pre-versioning (sequence-less) pointer replayed over a versioned active", async () => {
		const store = new MemoryCacheStore();
		await syncIndex({
			baseUrl: "/o",
			store,
			fetchBytes: sequencedFetch(5),
			verify: passVerify,
		});
		// The real fixture pointer carries no `sequence`; replaying it over a
		// versioned active is a rollback to a pre-versioning pointer → rejected.
		await expect(
			syncIndex({
				baseUrl: "/o",
				store,
				fetchBytes: sequenceLessFetch(),
				verify: passVerify,
			}),
		).rejects.toBeInstanceOf(IntegrityError);
		expect((await store.readActive())?.sequence).toBe(5);
	});

	it("rejects a sequence-less incoming pointer even on a fresh install", async () => {
		const store = new MemoryCacheStore();
		await expect(
			syncIndex({
				baseUrl: "/o",
				store,
				fetchBytes: sequenceLessFetch(),
				verify: passVerify,
			}),
		).rejects.toThrow(/sequence/i);
		expect(await store.readActive()).toBeNull();
	});

	it("allows a cached legacy active pointer to migrate to the sequenced chain", async () => {
		const store = new MemoryCacheStore();
		// Browser storage can contain a pointer promoted before sequence became
		// mandatory. Keep that cached state readable for one sequenced upgrade.
		const current = realPointer();
		const legacy = {
			manifest_hash: current.manifest_hash,
			version: current.version,
			signature: current.signature,
		} as unknown as VersionPointer;
		await store.promote(legacy);
		expect((await store.readActive())?.sequence).toBeUndefined();
		// A newly versioned pointer promotes over the legacy active (migration).
		await syncIndex({
			baseUrl: "/o",
			store,
			fetchBytes: sequencedFetch(1),
			verify: passVerify,
		});
		expect((await store.readActive())?.sequence).toBe(1);
	});
});

describe("syncIndex offline fallback to the cached active version", () => {
	async function primedStore(): Promise<MemoryCacheStore> {
		const store = new MemoryCacheStore();
		const { fetchBytes } = originFetch();
		await syncIndex({ baseUrl: "/o", store, fetchBytes, verify: realVerify });
		return store;
	}

	it("serves the cached version (0 fetched) when /latest is unreachable", async () => {
		const store = await primedStore();
		const active = await store.readActive();
		const offlineFetch: FetchBytes = (url) => {
			if (url.endsWith("/latest")) {
				return Promise.reject(new NetworkError(`offline: ${url}`));
			}
			return Promise.reject(new Error(`should not fetch ${url}`));
		};
		const result = await syncIndex({
			baseUrl: "/o",
			store,
			fetchBytes: offlineFetch,
			verify: realVerify,
		});
		expect(result.manifestHash).toBe(active?.manifest_hash);
		expect(result.chunksFetched).toBe(0);
	});

	it("re-throws when offline AND no active version is cached", async () => {
		const store = new MemoryCacheStore();
		const offlineFetch: FetchBytes = (url) =>
			Promise.reject(new NetworkError(`offline: ${url}`));
		await expect(
			syncIndex({
				baseUrl: "/o",
				store,
				fetchBytes: offlineFetch,
				verify: realVerify,
			}),
		).rejects.toBeInstanceOf(NetworkError);
	});

	it("does NOT fall back on a signature failure even with a cached version", async () => {
		const store = await primedStore();
		const before = await store.readActive();
		const pointer = realPointer();
		const tampered: VersionPointer = {
			...pointer,
			signature:
				(pointer.signature[0] === "A" ? "B" : "A") + pointer.signature.slice(1),
		};
		const fetchBytes: FetchBytes = (url) => {
			if (url.endsWith("/latest")) {
				return Promise.resolve(
					new TextEncoder().encode(JSON.stringify(tampered)),
				);
			}
			return Promise.reject(new Error(`unexpected ${url}`));
		};
		await expect(
			syncIndex({ baseUrl: "/o", store, fetchBytes, verify: realVerify }),
		).rejects.toThrow();
		expect((await store.readActive())?.manifest_hash).toBe(
			before?.manifest_hash,
		);
	});
});

/**
 * A production cold sync is ~1,296 independent chunk requests. `Promise.all`
 * over a single-attempt fetch means ONE transient failure anywhere in that fan
 * kills the whole sync and puts a Retry banner in front of a first-time visitor.
 * At a 0.1% per-request failure rate that is a ~73% chance of failing the boot.
 *
 * So a transient NetworkError on a chunk must be absorbed by a bounded retry.
 * The fail-closed boundary is unchanged: only NetworkError is retried. An
 * IntegrityError means the bytes did not match the content address, and
 * re-requesting the same address is pointless at best and a tamper-loop at
 * worst — it must propagate on the first occurrence.
 */
describe("syncIndex transient chunk-fetch resilience", () => {
	/**
	 * Make the Nth DISTINCT chunk (by first-seen order) fail its first `times`
	 * attempts with a NetworkError, then serve it normally. The first-seen index
	 * is recorded once per hash so it stays stable across that chunk's retries.
	 */
	function flakyChunks(
		bundle: { readonly fetchBytes: FetchBytes },
		failuresByChunkOrder: ReadonlyMap<number, number>,
	): { fetchBytes: FetchBytes; attempts: Map<string, number> } {
		const attempts = new Map<string, number>();
		const orderOf = new Map<string, number>();
		const fetchBytes: FetchBytes = (url, options) => {
			if (!url.includes("/chunk/")) {
				return bundle.fetchBytes(url, options);
			}
			const hash = url.split("/").at(-1) ?? url;
			if (!orderOf.has(hash)) {
				orderOf.set(hash, orderOf.size + 1);
			}
			const seen = (attempts.get(hash) ?? 0) + 1;
			attempts.set(hash, seen);
			const failTimes = failuresByChunkOrder.get(orderOf.get(hash) ?? 0) ?? 0;
			if (seen <= failTimes) {
				return Promise.reject(new NetworkError(`transient blip: ${url}`));
			}
			return bundle.fetchBytes(url, options);
		};
		return { fetchBytes, attempts };
	}

	const noSleep = () => Promise.resolve();

	it("absorbs a transient NetworkError on a chunk and still completes", async () => {
		const bundle = await syntheticBundle(20);
		const store = new RecordingCacheStore();
		// The 3rd distinct chunk fails twice before succeeding.
		const { fetchBytes, attempts } = flakyChunks(
			bundle,
			new Map([[3, 2]]),
		);

		const result = await syncIndex({
			baseUrl: "/o",
			store,
			fetchBytes,
			verify: passVerify,
			sleep: noSleep,
		});

		expect(result.version).toBeDefined();
		// Proof the retry actually happened rather than the failure being skipped.
		expect(Math.max(...attempts.values())).toBeGreaterThanOrEqual(3);
		// Every chunk still landed in the store.
		expect(store.verifiedChunks.size).toBe(bundle.chunkHashes.length);
	});

	it("still fails closed when a chunk fails every attempt", async () => {
		const bundle = await syntheticBundle(20);
		const store = new RecordingCacheStore();
		const { fetchBytes } = flakyChunks(
			bundle,
			new Map([[2, Number.MAX_SAFE_INTEGER]]),
		);

		await expect(
			syncIndex({
				baseUrl: "/o",
				store,
				fetchBytes,
				verify: passVerify,
				sleep: noSleep,
			}),
		).rejects.toBeInstanceOf(NetworkError);
		// Nothing was promoted: a partial download must not become the active set.
		expect(await store.readActive()).toBeNull();
	});

	/**
	 * The classifier is the whole security surface of this retry, so it is tested
	 * directly: the transport itself raises a NON-network failure. A retry loop
	 * that re-requests an immutable content address after an integrity verdict is
	 * a tamper-retry oracle — it must give up on the first occurrence.
	 *
	 * Testing this through a store-layer integrity failure would prove nothing:
	 * the store verify runs OUTSIDE the retry loop, so such a test passes even if
	 * the classifier is mutated to retry everything. Ask me how I know.
	 */
	it("does NOT retry a non-network chunk failure (integrity verdict)", async () => {
		const bundle = await syntheticBundle(20);
		const store = new RecordingCacheStore();
		const attempts = new Map<string, number>();
		let poisoned: string | undefined;
		const fetchBytes: FetchBytes = (url, options) => {
			if (!url.includes("/chunk/")) {
				return bundle.fetchBytes(url, options);
			}
			const hash = url.split("/").at(-1) ?? url;
			attempts.set(hash, (attempts.get(hash) ?? 0) + 1);
			poisoned ??= hash;
			if (hash === poisoned) {
				return Promise.reject(
					new IntegrityError(`chunk ${hash} failed content-address check`),
				);
			}
			return bundle.fetchBytes(url, options);
		};

		await expect(
			syncIndex({
				baseUrl: "/o",
				store,
				fetchBytes,
				verify: passVerify,
				sleep: noSleep,
			}),
		).rejects.toBeInstanceOf(IntegrityError);
		// Exactly one attempt on the poisoned chunk: integrity is never retried.
		expect(attempts.get(poisoned ?? "")).toBe(1);
	});
});
