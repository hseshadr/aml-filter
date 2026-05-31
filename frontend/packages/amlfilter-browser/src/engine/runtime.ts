// The browser runtime that turns the synced, signed OFAC bundle into a live,
// in-tab ScreeningEngine — the in-browser replacement for the FastAPI screen.
//
// Two Workers, off the UI thread:
//   - the sync Worker (worker.ts) owns OPFS + the ported sync_index; it pulls the
//     signed, content-addressed bundle from the origin, verifies it ed25519 +
//     sha256 fail-closed, and materializes the four bundle files;
//   - the embedder Worker (embedderWorker.ts) owns transformers.js: the ~25 MB
//     all-MiniLM-L6-v2 weights download + ONNX inference.
//
// bootstrap() drives both with a progress callback so the UI can show real
// stages (syncing bundle… loading model…). It is idempotent: the engine is
// built once and cached; later calls return the same instance.

import { EngineClient } from "./client";
import { createEmbedder, type Embedder } from "./embedder";
import { createWorkerEmbedder, spawnEmbedderWorker } from "./embedderClient";
import {
	createScreeningEngine,
	type ScreeningBundleFiles,
	type ScreeningEngine,
} from "./screeningEngine";
import type { SyncResult } from "./types";

/** The four bundle files the in-browser screen is assembled from. */
const ENTITIES_PATH = "entities.jsonl";
const INDEX_PATH = "vector/index.faiss";
const STATE_PATH = "vector/state.json";
const META_PATH = "ofac_meta.json";

/** Any non-empty string warms the ONNX session; content is discarded. */
const WARMUP_PROMPT = "warm up the model";

/** A bootstrap stage, surfaced to the UI for a real progress story. */
export type BootStage =
	| { readonly kind: "syncing" }
	| { readonly kind: "synced"; readonly result: SyncResult }
	| { readonly kind: "reassembling" }
	| { readonly kind: "loading-model" }
	| { readonly kind: "ready" };

/** Progress sink; called as bootstrap advances through its stages. */
export type OnStage = (stage: BootStage) => void;

/** Where the bundle is synced from + the pinned verify key, from Vite env. */
export interface RuntimeConfig {
	/** Origin serving the signed bundle (`/latest`, `/manifest/*`, `/chunk/*`). */
	readonly bundleBaseUrl: string;
	/** Same-origin URL of the pinned ed25519 public key (NOT the bundle origin). */
	readonly pubkeyUrl: string;
}

/** The sync-Worker surface bootstrap needs: pull the bundle, read its files. */
export interface EnginePort {
	sync(baseUrl: string, pubkeyUrl: string): Promise<SyncResult>;
	readFile(path: string): Promise<Uint8Array>;
}

/** The seams bootstrap depends on; defaulted to the real Workers, faked in tests. */
export interface RuntimeDeps {
	readonly spawnEngine: () => EnginePort;
	readonly makeEmbedder: () => Embedder;
}

const defaultDeps: RuntimeDeps = {
	spawnEngine: () => EngineClient.spawn(),
	makeEmbedder: () => createWorkerEmbedder(spawnEmbedderWorker()),
};

/** Build the production runtime deps (real sync Worker + real embedder Worker). */
export function defaultRuntimeDeps(): RuntimeDeps {
	return defaultDeps;
}

async function readBundleFiles(
	engine: EnginePort,
): Promise<ScreeningBundleFiles> {
	const [entities, index, state, meta] = await Promise.all([
		engine.readFile(ENTITIES_PATH),
		engine.readFile(INDEX_PATH),
		engine.readFile(STATE_PATH),
		engine.readFile(META_PATH),
	]);
	return { entities, index, state, meta };
}

/** Read Vite env into a RuntimeConfig; the pubkey is pinned same-origin. */
export function configFromEnv(
	env: Readonly<Record<string, string>>,
): RuntimeConfig {
	const bundleBaseUrl = env.VITE_BUNDLE_BASE_URL ?? "";
	// The pinned key ships in the SPA build (public/public.key), served from the
	// app's OWN trusted origin — never fetched from the untrusted bundle origin.
	const pubkeyUrl = new URL("public.key", document.baseURI).toString();
	return { bundleBaseUrl, pubkeyUrl };
}

/** Re-exported so call sites that only need the pure embedder can build one. */
export { createEmbedder };

/**
 * Sync the signed bundle, warm the embedder, and build the in-tab
 * ScreeningEngine. Idempotent — the first call wins and its result is cached.
 */
export class EngineRuntime {
	readonly #deps: RuntimeDeps;
	#enginePromise: Promise<ScreeningEngine> | null = null;
	#ready: ScreeningEngine | null = null;

	public constructor(deps: RuntimeDeps = defaultDeps) {
		this.#deps = deps;
	}

	/** The ready engine, or null before the first successful bootstrap. */
	public engine(): ScreeningEngine | null {
		return this.#ready;
	}

	/** Build (or reuse) the engine over the synced bundle, reporting progress. */
	public bootstrap(
		config: RuntimeConfig,
		onStage: OnStage = () => {},
	): Promise<ScreeningEngine> {
		if (this.#enginePromise === null) {
			this.#enginePromise = this.#build(config, onStage).catch((error) => {
				// Let a failed bootstrap be retried by clearing the memo.
				this.#enginePromise = null;
				throw error;
			});
		}
		return this.#enginePromise;
	}

	async #build(
		config: RuntimeConfig,
		onStage: OnStage,
	): Promise<ScreeningEngine> {
		const engineClient = this.#deps.spawnEngine();
		onStage({ kind: "syncing" });
		const result = await engineClient.sync(
			config.bundleBaseUrl,
			config.pubkeyUrl,
		);
		onStage({ kind: "synced", result });

		onStage({ kind: "reassembling" });
		const files = await readBundleFiles(engineClient);

		onStage({ kind: "loading-model" });
		const embedder = this.#deps.makeEmbedder();
		// Force the ~25 MB model download/compile now so "loading-model" reflects
		// real work and the first user query is fast.
		await embedder.embed(WARMUP_PROMPT);

		const engine = createScreeningEngine(files, embedder);
		this.#ready = engine;
		onStage({ kind: "ready" });
		return engine;
	}
}
