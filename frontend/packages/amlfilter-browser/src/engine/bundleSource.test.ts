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
import { describe, expect, it } from "vitest";
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
import type { FetchBytes, IndexManifest } from "./sync/types";

// engine -> src -> amlfilter-browser -> packages -> frontend -> app/public.
const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "..", "..", "..", "app", "public");
const ORIGIN = join(PUBLIC, "bundle", "origin");
const PINNED_PUBKEY = join(PUBLIC, "public.key");

/** The pinned ed25519 public key the SPA ships (= public half of demo.key). */
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
} {
	const store = new MemoryCacheStore();
	const { fetchBytes, chunkRequests } = originFetch();
	let manifest: IndexManifest | null = null;
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
			if (manifest === null) {
				return Promise.reject(new Error("sync first"));
			}
			return materializeFile(store, manifest, path);
		},
		clear() {
			return store.clear();
		},
	};
	return { deps: { createClient: () => client }, chunkRequests };
}

const PUBKEY_URL = "https://app.example/public.key";

describe("openBundleSource — over the committed demo bundle", () => {
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
