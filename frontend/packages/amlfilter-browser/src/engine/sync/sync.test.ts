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
	function sequencedFetch(sequence: number): FetchBytes {
		const origin = originFetch();
		return (url) => {
			if (url.endsWith("/latest")) {
				const pointer = JSON.parse(
					DECODER.decode(latestBytes()),
				) as VersionPointer;
				const withSeq = { ...pointer, sequence };
				return Promise.resolve(
					new TextEncoder().encode(JSON.stringify(withSeq)),
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
		const { fetchBytes } = originFetch();
		await expect(
			syncIndex({ baseUrl: "/o", store, fetchBytes, verify: realVerify }),
		).rejects.toBeInstanceOf(RollbackError);
		expect((await store.readActive())?.sequence).toBe(5);
	});

	it("allows the first upgrade from a legacy (sequence-less) active to a versioned pointer", async () => {
		const store = new MemoryCacheStore();
		// Legacy active: the real fixture pointer (no sequence) promotes cleanly.
		const { fetchBytes } = originFetch();
		await syncIndex({ baseUrl: "/o", store, fetchBytes, verify: realVerify });
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
