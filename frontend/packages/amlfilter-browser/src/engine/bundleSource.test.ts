// openBundleSource + EngineRuntime bundle path, driven END-TO-END against the
// REAL committed demo bundle (frontend/app/public/bundle/origin/) and the REAL
// pinned key (frontend/app/public/public.key) — the demoBundleParity pattern,
// extended past materialization into the runtime that screens from it.
//
// In the browser, openBundleSource drives a Worker EngineClient (the OPFS store +
// sync access handles are Worker-only). Here we inject an IN-PROCESS fake client
// that runs the SAME syncIndex + materializeFile over an in-memory CacheStore with
// an fs-backed FetchBytes over the committed origin tree — no Worker, no OPFS. The
// pinned pubkey is verified in-process against the committed key (the Worker would
// fetch it same-origin from pubkeyUrl, NEVER from the bundle origin).

/// <reference types="node" />

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
	type BundleEngineClient,
	type BundleSourceDeps,
	openBundleSource,
} from "./bundleSource";
import { verifyEd25519 } from "./crypto";
import type { Embedder } from "./embedder";
import { EngineRuntime, type RuntimeConfig, type RuntimeDeps } from "./runtime";
import { MemoryCacheStore } from "./sync/memoryStore";
import { materializeFile, syncIndex } from "./sync/sync";
import type { FetchBytes, IndexManifest, SyncResult } from "./sync/types";
import { WatchlistFormatError } from "./watchlist";

// engine -> src -> amlfilter-browser -> packages -> frontend -> app/public.
const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "..", "..", "..", "app", "public");
const ORIGIN = join(PUBLIC, "bundle", "origin");
// The committed demo bundle is signed with the THROWAWAY demo key, not the
// production pin (public/public.key) — verify it against the demo public half.
const PINNED_PUBKEY = join(
	HERE,
	"..",
	"..",
	"..",
	"amlfilter-publisher",
	"fixtures",
	"demo-public.key",
);

/** The committed demo bundle's ed25519 public key (public half of demo.key). */
const PUBKEY = new Uint8Array(readFileSync(PINNED_PUBKEY));

const DECODER = new TextDecoder();

/** A FetchBytes over the committed origin tree (no network). Records chunk hits
 * so a "delta reuse" assertion can prove a re-sync fetched 0 chunks. */
function originFetch(): {
	readonly fetchBytes: FetchBytes;
	chunkRequests: () => ReadonlyArray<string>;
} {
	const chunkUrls: string[] = [];
	const fetchBytes: FetchBytes = (url) => {
		if (url.endsWith("/latest")) {
			return Promise.resolve(
				new Uint8Array(readFileSync(join(ORIGIN, "latest"))),
			);
		}
		const manifestMatch = url.match(/\/manifest\/([0-9a-f]+)$/);
		if (manifestMatch?.[1] !== undefined) {
			return Promise.resolve(
				new Uint8Array(
					readFileSync(join(ORIGIN, "manifest", manifestMatch[1])),
				),
			);
		}
		const chunkMatch = url.match(/\/chunk\/([0-9a-f]+)$/);
		if (chunkMatch?.[1] !== undefined) {
			chunkUrls.push(chunkMatch[1]);
			return Promise.resolve(
				new Uint8Array(readFileSync(join(ORIGIN, "chunk", chunkMatch[1]))),
			);
		}
		return Promise.reject(new Error(`unexpected url ${url}`));
	};
	return { fetchBytes, chunkRequests: () => chunkUrls };
}

/** An in-process BundleEngineClient mirroring worker.ts: syncIndex + materializeFile
 * over a single in-memory store + the committed-tree fetch, verifying against the
 * pinned key. Returned as the SAME instance from createClient so a second
 * openBundleSource into the same deps re-uses the warmed store (delta sync). */
function memoryClient(): {
	deps: BundleSourceDeps;
	chunkRequests: () => ReadonlyArray<string>;
	readPaths: () => ReadonlyArray<string>;
} {
	const store = new MemoryCacheStore();
	const { fetchBytes, chunkRequests } = originFetch();
	let manifest: IndexManifest | null = null;
	const paths: string[] = [];
	const client: BundleEngineClient = {
		async sync(baseUrl, _pubkeyUrl) {
			const result = await syncIndex({
				baseUrl,
				store,
				fetchBytes,
				verify: (message, signature) =>
					verifyEd25519(PUBKEY, message, signature),
			});
			manifest = JSON.parse(
				DECODER.decode(await store.getManifest(result.manifestHash)),
			) as IndexManifest;
			return result;
		},
		readFile(path) {
			paths.push(path);
			if (manifest === null) {
				return Promise.reject(new Error("sync first"));
			}
			return materializeFile(store, manifest, path);
		},
		clear() {
			return store.clear();
		},
	};
	return {
		deps: { createClient: () => client },
		chunkRequests,
		readPaths: () => paths,
	};
}

const PUBKEY_URL = "https://app.example/public.key";

describe("openBundleSource — over the committed demo bundle", () => {
	it("disposes the sync client exactly once when the source is evicted", async () => {
		const { deps: baseDeps } = memoryClient();
		const inner = baseDeps.createClient();
		const terminate = vi.fn();
		const source = await openBundleSource("/o", PUBKEY_URL, {
			createClient: () => ({
				sync: (baseUrl, pubkeyUrl, progress) =>
					inner.sync(baseUrl, pubkeyUrl, progress),
				readFile: (path) => inner.readFile(path),
				clear: () => inner.clear(),
				terminate,
			}),
		});

		source.dispose?.();
		source.dispose?.();
		expect(terminate).toHaveBeenCalledTimes(1);
	});

	it("syncs, materializes the catalog, and reports the signed version", async () => {
		const { deps } = memoryClient();
		const source = await openBundleSource("/o", PUBKEY_URL, deps);
		expect(source.version()).toBe("demo-1");
		const catalog = source.loadCatalog();
		expect(catalog.schema).toBe(1);
		// The committed demo bundle ships OFAC/EU/UN/UK.
		expect(catalog.lists.map((l) => l.id).sort()).toEqual([
			"EU_CONSOLIDATED",
			"OFAC_SDN",
			"UK_OFSI",
			"UN_CONSOLIDATED",
		]);
		// Slug is carried as `path` (trailing slash) for materialization.
		const ofac = catalog.lists.find((l) => l.id === "OFAC_SDN");
		expect(ofac?.path).toBe("ofac/");
	});

	it("forwards the cold-sync progress sink through to the client's sync", async () => {
		// Wrap the working memory client so its sync emits one progress tick, then
		// assert openBundleSource forwarded the sink it was given down to it.
		const { deps: baseDeps } = memoryClient();
		const inner = baseDeps.createClient();
		const wrapped: BundleEngineClient = {
			sync: (baseUrl, pubkeyUrl, onProgress) => {
				onProgress?.({ fetched: 1, total: 1, bytes: 10 });
				return inner.sync(baseUrl, pubkeyUrl);
			},
			readFile: (path) => inner.readFile(path),
			clear: () => inner.clear(),
		};
		const seen: Array<{ fetched: number; total: number; bytes: number }> = [];
		await openBundleSource(
			"/o",
			PUBKEY_URL,
			{ createClient: () => wrapped },
			(p) => seen.push(p),
		);
		expect(seen).toEqual([{ fetched: 1, total: 1, bytes: 10 }]);
	});

	it("builds a per-list LoadedWatchlist from materialized files (Ivan Fakovich present)", async () => {
		const { deps } = memoryClient();
		const source = await openBundleSource("/o", PUBKEY_URL, deps);
		const catalog = source.loadCatalog();
		const ofacEntry = catalog.lists.find((l) => l.id === "OFAC_SDN");
		if (ofacEntry === undefined) {
			throw new Error("OFAC list missing from the committed bundle catalog");
		}
		const loaded = await source.loadList(ofacEntry);
		expect(loaded.listId).toBe("OFAC_SDN");
		expect(loaded.version).toBe("demo-1");
		const names = [...loaded.entities.values()].map((e) => e.name_canonical);
		expect(names).toContain("ivan fakovich");
		// vectors decoded into the index (one row per entity).
		expect(loaded.index.ntotal).toBe(loaded.entities.size);
	});

	it("loads list metadata without materializing vectors", async () => {
		const { deps, readPaths } = memoryClient();
		const source = await openBundleSource("/o", PUBKEY_URL, deps);
		const ofacEntry = source
			.loadCatalog()
			.lists.find((l) => l.id === "OFAC_SDN");
		if (ofacEntry === undefined) {
			throw new Error("OFAC list missing from the committed bundle catalog");
		}
		if (source.loadListMetadata === undefined) {
			throw new Error("metadata loader missing");
		}
		const metadata = await source.loadListMetadata(ofacEntry);
		expect(metadata.listId).toBe("OFAC_SDN");
		expect(metadata.entities.size).toBe(ofacEntry.entitiesCount);
		expect(readPaths()).toEqual(
			expect.arrayContaining(["ofac/entities.jsonl", "ofac/meta.json"]),
		);
		expect(readPaths()).not.toContain("ofac/vectors.f32");
	});

	it("reuses cached chunks on a second open into the same store (delta sync)", async () => {
		const { deps, chunkRequests } = memoryClient();
		await openBundleSource("/o", PUBKEY_URL, deps);
		const fetchedFirst = chunkRequests().length;
		expect(fetchedFirst).toBeGreaterThan(0);
		// Second open re-using the SAME client/store: every chunk is already present,
		// so the delta sync fetches none.
		await openBundleSource("/o", PUBKEY_URL, deps);
		expect(chunkRequests().length).toBe(fetchedFirst);
	});
});

// --- EngineRuntime bundle path: boot + screen over the committed bundle --------

const BUNDLE_CONFIG: RuntimeConfig = {
	pubkeyUrl: PUBKEY_URL,
	bundleBaseUrl: "/o",
};

/** A stub embedder: the query vector is arbitrary (orthogonal to the real MiniLM
 * rows). The exact-name match still surfaces via the trigram signal — candidate
 * retrieval over-fetches every entity in the tiny demo list, so the name_trigram
 * signal (1.0 on an exact canonical match) carries it. */
function stubEmbedder(): Embedder {
	return { embed: () => Promise.resolve(new Float32Array(384)) };
}

/** Runtime deps that take the BUNDLE path over an in-memory store + the
 * committed-tree fetch, with a stub embedder (no model download). */
function bundleRuntimeDeps(): RuntimeDeps {
	const { deps: bundleDeps } = memoryClient();
	return {
		makeEmbedder: () => stubEmbedder(),
		clearCache: () => Promise.resolve(),
		openBundleSource: (baseUrl, pubkeyUrl) =>
			openBundleSource(baseUrl, pubkeyUrl, bundleDeps),
	};
}

describe("EngineRuntime — bundle path boot + screen", () => {
	it("boots over the committed bundle and screens a known demo entity", async () => {
		const runtime = new EngineRuntime(bundleRuntimeDeps());
		const stages: string[] = [];
		const engine = await runtime.bootstrap(BUNDLE_CONFIG, (s) =>
			stages.push(s.kind),
		);
		// Stages: downloading -> verified -> loading-model -> ready.
		expect(stages[0]).toBe("downloading");
		expect(stages).toContain("verified");
		expect(stages.at(-1)).toBe("ready");
		// The composite version stamp carries the demo bundle's per-list versions.
		expect(runtime.version()).toContain("OFAC_SDN@demo-1");

		const res = await engine.screen({
			name: "ivan fakovich",
			dob: "1971-03-14",
			threshold: 0.1,
			k: 20,
		});
		const ivan = res.matches.find((m) => m.primary_name === "Ivan Fakovich");
		expect(ivan).toBeDefined();
		expect(ivan?.score).toBeGreaterThan(0);
		expect(ivan?.explanation.length).toBeGreaterThan(0);
		expect(ivan?.reasons.some((r) => r.signal === "dob_match")).toBe(true);
	});

	it("a nonsense query returns no match on the bundle path", async () => {
		const runtime = new EngineRuntime(bundleRuntimeDeps());
		const engine = await runtime.bootstrap(BUNDLE_CONFIG);
		const res = await engine.screen({
			name: "zxqwqx vbnmlk",
			threshold: 0.65,
			k: 20,
		});
		expect(res.matches).toEqual([]);
	});

	it("fetchPublishedVersion polls the signed bundle pointer's version", async () => {
		const runtime = new EngineRuntime(bundleRuntimeDeps());
		await runtime.bootstrap(BUNDLE_CONFIG);
		const published = await runtime.fetchPublishedVersion();
		expect(published).toContain("OFAC_SDN@demo-1");
	});
});

// --- fail-closed catalog validation + list version skew + clear ----------------

const CRAFTED_SYNC: SyncResult = {
	version: "crafted-1",
	manifestHash: "h".repeat(64),
	chunksFetched: 0,
	chunksReused: 0,
	bytesFetched: 0,
};

/** A client whose synced store materializes exactly one crafted catalog.json —
 * the seam for driving assertBundleCatalog's fail-closed arms from the public
 * openBundleSource surface. Records whether clear() reached the client. */
function craftedClient(catalogJson: unknown): {
	deps: BundleSourceDeps;
	wasCleared: () => boolean;
	wasTerminated: () => boolean;
} {
	let cleared = false;
	let terminated = false;
	const client: BundleEngineClient = {
		sync: () => Promise.resolve(CRAFTED_SYNC),
		readFile: (path) => {
			if (path === "catalog.json") {
				return Promise.resolve(
					new TextEncoder().encode(JSON.stringify(catalogJson)),
				);
			}
			return Promise.reject(new Error(`unexpected readFile ${path}`));
		},
		clear: () => {
			cleared = true;
			return Promise.resolve();
		},
		terminate: () => {
			terminated = true;
		},
	};
	return {
		deps: { createClient: () => client },
		wasCleared: () => cleared,
		wasTerminated: () => terminated,
	};
}

describe("openBundleSource — fail-closed catalog validation", () => {
	it("rejects a catalog that is not an object", async () => {
		const { deps, wasTerminated } = craftedClient(null);
		const pending = openBundleSource("/o", PUBKEY_URL, deps);
		await expect(pending).rejects.toBeInstanceOf(WatchlistFormatError);
		await expect(pending).rejects.toThrow(/not an object/);
		expect(wasTerminated()).toBe(true);
	});

	it("rejects a catalog with the wrong schemaVersion", async () => {
		const { deps } = craftedClient({
			schemaVersion: 2,
			generatedAt: "2026-06-19T00:00:00Z",
			lists: [],
		});
		await expect(openBundleSource("/o", PUBKEY_URL, deps)).rejects.toThrow(
			/schemaVersion is 2; expected 1/,
		);
	});

	it("rejects a catalog missing the lists[] array", async () => {
		const { deps } = craftedClient({
			schemaVersion: 1,
			generatedAt: "2026-06-19T00:00:00Z",
		});
		await expect(openBundleSource("/o", PUBKEY_URL, deps)).rejects.toThrow(
			/missing a lists\[\] array/,
		);
	});

	it("rejects a non-object list entry", async () => {
		const { deps } = craftedClient({
			schemaVersion: 1,
			generatedAt: "2026-06-19T00:00:00Z",
			lists: [null],
		});
		await expect(openBundleSource("/o", PUBKEY_URL, deps)).rejects.toThrow(
			/malformed list entry/,
		);
	});

	it("rejects a list entry whose entitiesCount is not a finite number", async () => {
		const { deps } = craftedClient({
			schemaVersion: 1,
			generatedAt: "2026-06-19T00:00:00Z",
			lists: [
				{
					id: "OFAC_SDN",
					title: "OFAC SDN",
					slug: "ofac",
					version: "1",
					entitiesCount: "many",
				},
			],
		});
		await expect(openBundleSource("/o", PUBKEY_URL, deps)).rejects.toThrow(
			/malformed list entry/,
		);
	});
});

describe("openBundleSource — version skew + clear passthrough", () => {
	it("fail-closes when a list's meta version disagrees with the catalog", async () => {
		const { deps } = memoryClient();
		const source = await openBundleSource("/o", PUBKEY_URL, deps);
		const catalog = source.loadCatalog();
		const ofacEntry = catalog.lists.find((l) => l.id === "OFAC_SDN");
		if (ofacEntry === undefined) {
			throw new Error("OFAC list missing from the committed bundle catalog");
		}
		// The materialized meta.json says demo-1; a catalog claiming otherwise is
		// a publisher inconsistency and must abort the list load, not half-load.
		const pending = source.loadList({ ...ofacEntry, version: "tampered-9" });
		await expect(pending).rejects.toBeInstanceOf(WatchlistFormatError);
		await expect(pending).rejects.toThrow(/version skew/);
	});

	it("clear() drops the durable store through the client", async () => {
		const { deps, wasCleared, wasTerminated } = craftedClient({
			schemaVersion: 1,
			generatedAt: "2026-06-19T00:00:00Z",
			lists: [],
		});
		const source = await openBundleSource("/o", PUBKEY_URL, deps);
		expect(wasCleared()).toBe(false);
		await source.clear();
		expect(wasCleared()).toBe(true);
		expect(wasTerminated()).toBe(true);
	});
});
