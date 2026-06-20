// Cache-aware load tests (Theme C). The cache-aware loaders sit over the
// fail-closed network loaders and the durable byte cache, and the SECURITY
// CRUX is here: cached bytes are re-verified with verifyEd25519 against the
// pinned key on EVERY load — a tampered cache row is rejected and the loader
// falls through to the (verify-before-parse) network. fake-indexeddb backs the
// cache (vite.config.ts setupFiles); the network is stubbed via the loader seam.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	catalogBytes,
	catalogSig,
	pubkeyRaw,
	watchlistBytes,
	watchlistManifestBytes,
	watchlistSig,
} from "./fixtures";
import {
	CATALOG_CACHE_KEY,
	clearAll,
	readArtifact,
	writeArtifact,
} from "./listCache";
import {
	loadCatalogCached,
	loadListCached,
	type NetworkLoaders,
} from "./watchlistCache";

const DECODER = new TextDecoder();

/** Copy a Uint8Array into a fresh, plain ArrayBuffer (the CachedArtifact.bytes
 * type — a Node Buffer's `.buffer` is the wider ArrayBufferLike). */
function toAb(u8: Uint8Array): ArrayBuffer {
	const out = new ArrayBuffer(u8.byteLength);
	new Uint8Array(out).set(u8);
	return out;
}

/** The OFAC catalog entry as the committed signed catalog publishes it. */
function ofacEntry(version: string, entitiesCount = 1) {
	return {
		id: "OFAC_SDN",
		title: "OFAC SDN",
		version,
		entitiesCount,
		path: "ofac/",
	};
}

/** The version stamped on the committed OFAC artifacts. */
function committedVersion(): string {
	return JSON.parse(DECODER.decode(watchlistManifestBytes())).version as string;
}

/** A NetworkLoaders whose calls are spies the test can assert against. */
function spyLoaders(version: string): NetworkLoaders & {
	loadCatalog: ReturnType<typeof vi.fn>;
	loadCatalogArtifact: ReturnType<typeof vi.fn>;
	loadListArtifact: ReturnType<typeof vi.fn>;
} {
	return {
		loadCatalog: vi.fn(async () => ({
			schema: 1 as const,
			generatedAt: "2026-06-20T00:00:00Z",
			lists: [ofacEntry(version)],
		})),
		loadCatalogArtifact: vi.fn(async () => ({
			bytes: catalogBytes(),
			signatureBase64: catalogSig(),
		})),
		loadListArtifact: vi.fn(async () => ({
			bytes: watchlistBytes(),
			signatureBase64: watchlistSig(),
		})),
	};
}

const PUBKEY = pubkeyRaw();

beforeEach(async () => {
	await clearAll();
});
afterEach(async () => {
	await clearAll();
	vi.restoreAllMocks();
});

describe("loadListCached — cache hit re-verifies + skips network", () => {
	it("a matching-version cached artifact is re-verified and used WITHOUT the network", async () => {
		const version = committedVersion();
		// Seed the cache with the genuine signed OFAC bytes + sig.
		await writeArtifact({
			key: "OFAC_SDN",
			version,
			bytes: toAb(watchlistBytes()),
			signatureBase64: watchlistSig(),
			cachedAt: "2026-06-20T00:00:00Z",
		});
		const loaders = spyLoaders(version);

		const loaded = await loadListCached(PUBKEY, ofacEntry(version), loaders);

		expect(loaded.listId).toBe("OFAC_SDN");
		expect(loaded.version).toBe(version);
		// The cache hit served it — the network list loader was never called.
		expect(loaders.loadListArtifact).not.toHaveBeenCalled();
	});

	it("TAMPERED cached bytes are REJECTED by verify and fall through to the network", async () => {
		const version = committedVersion();
		// Flip a byte in the cached blob: the signature no longer matches.
		const tampered = watchlistBytes();
		tampered.set([(tampered.at(-1) ?? 0) ^ 0xff], tampered.length - 1);
		await writeArtifact({
			key: "OFAC_SDN",
			version,
			bytes: toAb(tampered),
			signatureBase64: watchlistSig(),
			cachedAt: "2026-06-20T00:00:00Z",
		});
		const loaders = spyLoaders(version);

		const loaded = await loadListCached(PUBKEY, ofacEntry(version), loaders);

		// The poisoned row failed verifyEd25519 → the loader re-fetched + re-verified.
		expect(loaders.loadListArtifact).toHaveBeenCalledTimes(1);
		expect(loaded.listId).toBe("OFAC_SDN");
		// And the cache was healed with the genuine network bytes.
		const healed = await readArtifact("OFAC_SDN");
		expect(new Uint8Array(healed?.bytes ?? new ArrayBuffer(0))).toEqual(
			watchlistBytes(),
		);
	});

	it("a cache MISS fetches from the network and writes the cache", async () => {
		const version = committedVersion();
		const loaders = spyLoaders(version);

		const loaded = await loadListCached(PUBKEY, ofacEntry(version), loaders);

		expect(loaders.loadListArtifact).toHaveBeenCalledTimes(1);
		expect(loaded.listId).toBe("OFAC_SDN");
		expect((await readArtifact("OFAC_SDN"))?.version).toBe(version);
	});

	it("a VERSION MISMATCH (cache stale vs signed catalog) re-fetches", async () => {
		const version = committedVersion();
		await writeArtifact({
			key: "OFAC_SDN",
			version: "stale-old",
			bytes: toAb(watchlistBytes()),
			signatureBase64: watchlistSig(),
			cachedAt: "2026-06-20T00:00:00Z",
		});
		const loaders = spyLoaders(version);

		await loadListCached(PUBKEY, ofacEntry(version), loaders);

		expect(loaders.loadListArtifact).toHaveBeenCalledTimes(1);
		expect((await readArtifact("OFAC_SDN"))?.version).toBe(version);
	});

	it("the size sanity-check REJECTS an absurdly small blob fail-closed", async () => {
		const version = committedVersion();
		const loaders = spyLoaders(version);
		// Claim a million entities for a tiny blob → wildly implausible, rejected.
		await expect(
			loadListCached(PUBKEY, ofacEntry(version, 1_000_000), loaders),
		).rejects.toThrow();
	});
});

describe("loadCatalogCached — offline catalog fallback", () => {
	it("network success caches the verified catalog bytes", async () => {
		const loaders = spyLoaders(committedVersion());

		const catalog = await loadCatalogCached(PUBKEY, loaders);

		expect(catalog.schema).toBe(1);
		expect(await readArtifact(CATALOG_CACHE_KEY)).not.toBeNull();
	});

	it("OFFLINE (network throws) falls back to the cached catalog, RE-VERIFIED", async () => {
		// Seed the cache with the genuine signed catalog bytes.
		await writeArtifact({
			key: CATALOG_CACHE_KEY,
			version: "catalog",
			bytes: toAb(catalogBytes()),
			signatureBase64: catalogSig(),
			cachedAt: "2026-06-20T00:00:00Z",
		});
		const loaders = spyLoaders(committedVersion());
		loaders.loadCatalogArtifact = vi.fn(async () => {
			throw new Error("offline");
		});

		const catalog = await loadCatalogCached(PUBKEY, loaders);

		expect(catalog.schema).toBe(1);
		expect(catalog.lists.length).toBeGreaterThan(0);
	});

	it("OFFLINE with a TAMPERED cached catalog rejects (re-verify fail-closed)", async () => {
		const tampered = catalogBytes();
		tampered.set([(tampered.at(0) ?? 0) ^ 0xff], 0);
		await writeArtifact({
			key: CATALOG_CACHE_KEY,
			version: "catalog",
			bytes: toAb(tampered),
			signatureBase64: catalogSig(),
			cachedAt: "2026-06-20T00:00:00Z",
		});
		const loaders = spyLoaders(committedVersion());
		loaders.loadCatalogArtifact = vi.fn(async () => {
			throw new Error("offline");
		});

		await expect(loadCatalogCached(PUBKEY, loaders)).rejects.toThrow();
	});

	it("OFFLINE with NO cached catalog rejects (nothing to fall back to)", async () => {
		const loaders = spyLoaders(committedVersion());
		loaders.loadCatalogArtifact = vi.fn(async () => {
			throw new Error("offline");
		});

		await expect(loadCatalogCached(PUBKEY, loaders)).rejects.toThrow();
	});
});
