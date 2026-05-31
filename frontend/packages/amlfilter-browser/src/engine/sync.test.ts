import { describe, expect, it } from "vitest";
import { verifyEd25519 } from "./crypto";
import { NetworkError } from "./fetchBytes";
import { latestBytes, originFetch, pubkeyRaw } from "./fixtures";
import { IntegrityError } from "./integrity";
import { MemoryCacheStore } from "./memoryStore";
import { materializeFile, syncIndex } from "./sync";
import type {
	FetchBytes,
	IndexManifest,
	Verify,
	VersionPointer,
} from "./types";

const DECODER = new TextDecoder();
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
