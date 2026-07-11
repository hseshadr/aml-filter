// In-browser query embedder. Reproduces edge-reco's Python ProductEncoder, which
// delegates to EdgeProc's TextEncoder: sentence-transformers all-MiniLM-L6-v2 with
// `normalize_embeddings=True`, i.e. mean-pooling over token embeddings followed by
// L2-normalization. transformers.js feature-extraction with
// `{ pooling: "mean", normalize: true }` is the byte-for-byte equivalent of that
// recipe, so embed(text) here matches encode_query(text) on the server to ~1e-3.
//
// The model load is async and heavy (~23 MB of weights), so the real pipeline is
// created once and cached. The Worker wrapper (createEmbedderWorkerHandler) keeps
// the load + inference off the main thread; the pure Embedder below is what the
// parity test exercises directly in Node.

import { env, type ProgressInfo, pipeline } from "@huggingface/transformers";

// transformers.js browser env.
//
// Weights are self-hosted, not pulled from huggingface.co at runtime. The app's
// `prebuild` hook (app/scripts/download-model.mjs) mirrors this model's files
// into app/public/models/, so they ship inside the SPA's own origin. Setting
// `allowLocalModels = true` + `localModelPath = "/models/"` makes transformers.js
// resolve each file as `/models/<modelId>/<file>` — e.g.
// `/models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx` — served same-origin
// instead of from the HF CDN. (In the browser the ONNX device is `wasm`; we pin
// dtype to the shared EMBEDDING_DTYPE (`q8`) EXPLICITLY rather than relying on the
// wasm device's implicit default, so the runtime deterministically requests the
// `_quantized` ONNX export — the SAME export the Node publisher embeds with. That
// shared constant is what keeps the precomputed list vectors and the in-tab query
// vectors in one embedding space; see nodeEmbedder.ts.)
//
// `useBrowserCache` is RE-ENABLED. The original `Ke(...).call is not a function`
// crash that once motivated disabling it was NOT a CacheStorage bug: it was
// esbuild downleveling native private fields (`#field`) to a WeakMap accessor
// under the es2020 build target, which transformers.js's minified worker
// mis-invoked — fixed by `target: "es2022"` in app/vite.config.ts. The
// cold/blocked-CDN e2e (app/tests/e2e-c1/screen-cold-blocked.spec.ts) drives the
// MINIFIED prod build in a real Chromium with the cache on and asserts ZERO
// in-page console errors as the ~23 MB model loads, so a re-introduction of the
// old downlevel crash re-trips that test. With the cache on, a returning visitor
// reuses the cached weights instead of re-fetching them from /models/.
env.useBrowserCache = true;
env.allowLocalModels = true;
env.localModelPath = "/models/";
// FAIL CLOSED: never fall back to fetching an unpinned model from huggingface.co.
// transformers.js defaults `allowRemoteModels` to true, so a missing/renamed local
// weight would silently pull from the HF CDN — unacceptable for an AML tool, where
// the scoring model must be the exact self-hosted export. Off ⇒ a missing weight
// throws instead. The cold-blocked e2e proves boot succeeds with all CDNs aborted.
env.allowRemoteModels = false;

/** The onnxruntime-web wasm env knob the self-hosting config owns
 * (transformers.js exposes it as `env.backends.onnx.wasm`). Structural, so the
 * unit test can drive the decision with a fake alongside the real env. */
export interface OrtWasmEnvLike {
	wasmPaths?: string;
}

/**
 * `wasmPaths = "/ort/"` — self-host the ORT wasm LOADER, not just the model
 * (house standard §8.1b). onnxruntime-web dynamically imports its wasm loader
 * module (`ort-wasm-simd-threaded.asyncify.mjs`, which then fetches its sibling
 * `.wasm` relative to its own URL) at runtime, and the library's default base
 * for that import is the jsDelivr CDN. The cold-blocked e2e caught exactly that
 * on this repo: with jsDelivr aborted, boot died fetching
 * `cdn.jsdelivr.net/npm/onnxruntime-web/…/ort-wasm-simd-threaded.asyncify.mjs`.
 * The staged same-origin copy under /ort/ is materialized by the app's
 * `prebuild` hook (app/scripts/stage-ort-wasm.mjs) from the lockfile-pinned
 * node_modules bytes.
 */
export function configureOrtWasmPaths(ortWasm: OrtWasmEnvLike): void {
	ortWasm.wasmPaths = "/ort/";
}

/** The live onnxruntime-web wasm env, reached through transformers.js's loosely
 * typed `env.backends`; a missing node yields an inert target (the unit test on
 * the REAL env and the cold-blocked e2e both fail loudly if the knob moves). */
function ortWasmEnv(): OrtWasmEnvLike {
	const backends = env.backends as { onnx?: { wasm?: OrtWasmEnvLike } };
	return backends.onnx?.wasm ?? {};
}

configureOrtWasmPaths(ortWasmEnv());

/** The sentence-transformers model id, mirrored as its Xenova ONNX export. */
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

/** all-MiniLM-L6-v2 produces 384-dimensional embeddings. */
export const EMBEDDING_DIM = 384;

/**
 * The ONNX quantization the pipeline loads — the SINGLE knob both runtimes share.
 * The Node publisher (nodeEmbedder.ts) and this browser embedder must request the
 * SAME ONNX export so precomputed list vectors and in-tab query vectors live in
 * one space; `q8` is the `model_quantized.onnx` export self-hosted under
 * app/public/models. Pinned EXPLICITLY (not left to the wasm device's implicit
 * default) so the choice is shared, not coincidental.
 */
export const EMBEDDING_DTYPE = "q8";

/** Embeds a query string into a normalized 384-d vector. */
export interface Embedder {
	embed(text: string): Promise<Float32Array>;
}

/** Model-download progress, surfaced once per transformers.js "progress" event. */
export interface EmbedProgress {
	/** Bytes loaded so far for the file currently downloading. */
	readonly loaded: number;
	/** Total bytes for that file. */
	readonly total: number;
	/** Percent loaded (0–100), derived from loaded/total. */
	readonly pct: number;
}

/** A construction-time sink for model-load progress. Optional: progress is a
 * boot-banner nicety, not part of the shared {@link Embedder.embed} contract. */
export type OnEmbedProgress = (progress: EmbedProgress) => void;

/**
 * Map a transformers.js {@link ProgressInfo} to {@link EmbedProgress}, but only
 * for the "progress" status (the per-file download tick that carries byte
 * counts). Every other status — initiate / done / ready / progress_total —
 * yields undefined, so the banner only ever moves on real download progress.
 * `pct` is computed from loaded/total (total 0 ⇒ 0) rather than trusting the
 * library's own field, keeping this the single source of truth, then clamped to
 * [0, 100] — transformers.js can report `loaded > total` (compressed transfer
 * sizes) or a transient negative, which would otherwise render as e.g. "108%".
 */
export function mapProgress(info: ProgressInfo): EmbedProgress | undefined {
	if (info.status !== "progress") {
		return undefined;
	}
	const raw = info.total > 0 ? (info.loaded / info.total) * 100 : 0;
	const pct = Math.min(100, Math.max(0, raw));
	return { loaded: info.loaded, total: info.total, pct };
}

/** A feature-extraction call producing a flat numeric data buffer. */
type ExtractFn = (
	text: string,
	options: { readonly pooling: "mean"; readonly normalize: boolean },
) => Promise<{ readonly data: ArrayLike<number> }>;

/** Pipeline options this module passes through: the shared {@link EMBEDDING_DTYPE}
 * (always pinned), plus the progress callback transformers.js invokes during model
 * construction (weight download). */
interface PipelineOptions {
	readonly dtype?: string;
	readonly progress_callback?: (info: ProgressInfo) => void;
}

/** A narrowed view of transformers.js `pipeline`: building the feature-extraction
 * task yields a callable ExtractFn. The library's own overload union over every
 * task is too large for the compiler to represent (TS2590), so it is collapsed to
 * the one signature this module uses. */
type LoadFeatureExtraction = (
	task: "feature-extraction",
	model: string,
	options?: PipelineOptions,
) => Promise<ExtractFn>;

class PipelineEmbedder implements Embedder {
	readonly #load: () => Promise<ExtractFn>;
	#extract: ExtractFn | undefined;

	public constructor(load: () => Promise<ExtractFn>) {
		this.#load = load;
	}

	public async embed(text: string): Promise<Float32Array> {
		if (this.#extract === undefined) {
			this.#extract = await this.#load();
		}
		const output = await this.#extract(text, {
			pooling: "mean",
			normalize: true,
		});
		const vector = Float32Array.from(output.data);
		if (vector.length !== EMBEDDING_DIM) {
			throw new Error(
				`embedding has ${vector.length} dims; expected ${EMBEDDING_DIM}`,
			);
		}
		return vector;
	}
}

/** Build the `pipeline` options: always pin the shared {@link EMBEDDING_DTYPE} (so
 * the browser no longer relies on the wasm device's implicit q8 default), and add
 * the progress callback only when a sink is wired. */
function pipelineOptions(
	onProgress: OnEmbedProgress | undefined,
): PipelineOptions {
	if (onProgress === undefined) {
		return { dtype: EMBEDDING_DTYPE };
	}
	return {
		dtype: EMBEDDING_DTYPE,
		progress_callback: (info) => {
			const mapped = mapProgress(info);
			if (mapped !== undefined) {
				onProgress(mapped);
			}
		},
	};
}

/** Load the feature-extraction pipeline via an injected `pipeline`, pinning the
 * shared dtype and threading the (optional) progress sink as `progress_callback`. */
function loadWith(
	load: LoadFeatureExtraction,
	onProgress: OnEmbedProgress | undefined,
): () => Promise<ExtractFn> {
	return () =>
		load("feature-extraction", EMBEDDING_MODEL, pipelineOptions(onProgress));
}

/**
 * The default embedder, backed by the transformers.js feature-extraction
 * pipeline. The model is fetched + compiled lazily on the first embed call and
 * cached for the lifetime of the embedder. An optional `onProgress` sink is
 * called once per download tick so the boot banner can show a real percent.
 */
export function createEmbedder(onProgress?: OnEmbedProgress): Embedder {
	const load = pipeline as unknown as LoadFeatureExtraction;
	return new PipelineEmbedder(loadWith(load, onProgress));
}

/**
 * An embedder over an injected `pipeline` — the seam tests use to exercise the
 * progress_callback wiring without the real ~23 MB download.
 */
export function createEmbedderWithPipeline(
	load: LoadFeatureExtraction,
	onProgress?: OnEmbedProgress,
): Embedder {
	return new PipelineEmbedder(loadWith(load, onProgress));
}

/**
 * An embedder over an injected extractor — the seam the parity test uses to run
 * the real transformers.js pipeline in Node without a Worker.
 */
export function createEmbedderWith(load: () => Promise<ExtractFn>): Embedder {
	return new PipelineEmbedder(load);
}

export type { ExtractFn };
