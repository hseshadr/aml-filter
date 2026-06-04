// In-browser query embedder. Reproduces edge-reco's Python ProductEncoder, which
// delegates to EdgeProc's TextEncoder: sentence-transformers all-MiniLM-L6-v2 with
// `normalize_embeddings=True`, i.e. mean-pooling over token embeddings followed by
// L2-normalization. transformers.js feature-extraction with
// `{ pooling: "mean", normalize: true }` is the byte-for-byte equivalent of that
// recipe, so embed(text) here matches encode_query(text) on the server to ~1e-3.
//
// The model load is async and heavy (~25 MB of weights), so the real pipeline is
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
// instead of from the HF CDN. (In the browser the ONNX device is `wasm`, whose
// default dtype is `q8`, so the runtime requests the `_quantized` ONNX export.)
//
// `useBrowserCache` stays OFF for now. The original `Ke(...).call is not a
// function` crash that once motivated disabling it was NOT a CacheStorage bug:
// it was esbuild downleveling native private fields (`#field`) to a WeakMap
// accessor under the es2020 build target, which transformers.js's minified worker
// mis-invoked — fixed by `target: "es2022"` in app/vite.config.ts. Re-enabling the
// CacheStorage cache is deliberately deferred until a cold-cache e2e on the
// minified build proves that crash stays dead; until then we leave it off.
env.useBrowserCache = false;
env.allowLocalModels = true;
env.localModelPath = "/models/";

/** The sentence-transformers model id, mirrored as its Xenova ONNX export. */
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

/** all-MiniLM-L6-v2 produces 384-dimensional embeddings. */
export const EMBEDDING_DIM = 384;

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
 * library's own field, keeping this the single source of truth.
 */
export function mapProgress(info: ProgressInfo): EmbedProgress | undefined {
	if (info.status !== "progress") {
		return undefined;
	}
	const pct = info.total > 0 ? (info.loaded / info.total) * 100 : 0;
	return { loaded: info.loaded, total: info.total, pct };
}

/** A feature-extraction call producing a flat numeric data buffer. */
type ExtractFn = (
	text: string,
	options: { readonly pooling: "mean"; readonly normalize: boolean },
) => Promise<{ readonly data: ArrayLike<number> }>;

/** Pipeline options this module passes through: just the progress callback,
 * which transformers.js invokes during model construction (weight download). */
interface PipelineOptions {
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

/** Build the progress_callback options for `pipeline`, or undefined when no sink
 * is wired (so the un-instrumented path stays byte-identical to before). */
function progressOptions(
	onProgress: OnEmbedProgress | undefined,
): PipelineOptions | undefined {
	if (onProgress === undefined) {
		return undefined;
	}
	return {
		progress_callback: (info) => {
			const mapped = mapProgress(info);
			if (mapped !== undefined) {
				onProgress(mapped);
			}
		},
	};
}

/** Load the feature-extraction pipeline via an injected `pipeline`, threading
 * the (optional) progress sink as `progress_callback`. */
function loadWith(
	load: LoadFeatureExtraction,
	onProgress: OnEmbedProgress | undefined,
): () => Promise<ExtractFn> {
	return () =>
		load("feature-extraction", EMBEDDING_MODEL, progressOptions(onProgress));
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
