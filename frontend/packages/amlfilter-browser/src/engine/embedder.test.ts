import { env, type ProgressInfo } from "@huggingface/transformers";
import { describe, expect, it, vi } from "vitest";
import {
	configureOrtWasmPaths,
	createEmbedder,
	createEmbedderWith,
	EMBEDDING_DTYPE,
	EMBEDDING_MODEL,
	mapProgress,
	type OrtWasmEnvLike,
} from "./embedder";

// Unit-tests the pure progress-mapping seam: a transformers.js ProgressInfo with
// status "progress" maps to {loaded,total,pct}; every other status emits nothing.
// This is the narrowing that, if wrong, means the boot banner never shows a %.

describe("mapProgress", () => {
	it("maps a status:progress event to {loaded,total,pct}", () => {
		const info: ProgressInfo = {
			status: "progress",
			name: "Xenova/all-MiniLM-L6-v2",
			file: "onnx/model_quantized.onnx",
			progress: 42,
			loaded: 42,
			total: 100,
		};
		expect(mapProgress(info)).toEqual({ loaded: 42, total: 100, pct: 42 });
	});

	it("computes pct from loaded/total rather than trusting the field blindly", () => {
		const info: ProgressInfo = {
			status: "progress",
			name: "m",
			file: "f",
			progress: 0,
			loaded: 5,
			total: 20,
		};
		expect(mapProgress(info)?.pct).toBe(25);
	});

	it("yields undefined pct-divide safety when total is zero", () => {
		const info: ProgressInfo = {
			status: "progress",
			name: "m",
			file: "f",
			progress: 0,
			loaded: 0,
			total: 0,
		};
		expect(mapProgress(info)).toEqual({ loaded: 0, total: 0, pct: 0 });
	});

	it("clamps pct to 100 when loaded exceeds total (compressed transfer)", () => {
		// transformers.js can report loaded > total for gzip/br transfers, which
		// would otherwise render as "108%".
		const info: ProgressInfo = {
			status: "progress",
			name: "m",
			file: "f",
			progress: 108,
			loaded: 108,
			total: 100,
		};
		expect(mapProgress(info)?.pct).toBe(100);
	});

	it("clamps pct to 0 for a negative loaded value", () => {
		const info: ProgressInfo = {
			status: "progress",
			name: "m",
			file: "f",
			progress: 0,
			loaded: -10,
			total: 100,
		};
		expect(mapProgress(info)?.pct).toBe(0);
	});

	it.each([
		{ status: "initiate" as const, name: "m", file: "f" },
		{ status: "done" as const, name: "m", file: "f" },
		{ status: "ready" as const, task: "feature-extraction", model: "m" },
	])("emits nothing for status:$status", (info) => {
		expect(mapProgress(info as ProgressInfo)).toBeUndefined();
	});
});

describe("createEmbedder progress threading", () => {
	it("omits the progress callback that makes transformers.js fetch the ONNX model three times", async () => {
		const { createEmbedderWithPipeline } = await import("./embedder");
		const onProgress = vi.fn();
		let receivedOptions: {
			dtype?: string;
			progress_callback?: (i: ProgressInfo) => void;
		} = {};
		const fakePipeline = vi.fn(
			async (
				_task: string,
				_model: string,
				opts?: {
					dtype?: string;
					progress_callback?: (i: ProgressInfo) => void;
				},
			) => {
				receivedOptions = opts ?? {};
				return async () => ({ data: new Float32Array(384) });
			},
		);
		const embedder = createEmbedderWithPipeline(fakePipeline, onProgress);
		await embedder.embed("warm up");

		expect(receivedOptions.progress_callback).toBeUndefined();
		expect(onProgress).not.toHaveBeenCalled();
	});

	it("does not emit for a non-progress status during load", async () => {
		const { createEmbedderWithPipeline } = await import("./embedder");
		const onProgress = vi.fn();
		const fakePipeline = vi.fn(
			async (
				_task: string,
				_model: string,
				opts?: {
					dtype?: string;
					progress_callback?: (i: ProgressInfo) => void;
				},
			) => {
				opts?.progress_callback?.({ status: "done", name: "m", file: "f" });
				return async () => ({ data: new Float32Array(384) });
			},
		);
		const embedder = createEmbedderWithPipeline(fakePipeline, onProgress);
		await embedder.embed("warm up");

		expect(onProgress).not.toHaveBeenCalled();
	});
});

describe("ORT wasm loader self-hosting (house standard §8.1b)", () => {
	it("configureOrtWasmPaths points the loader at the same-origin /ort/ copy", () => {
		const fakeOrt: OrtWasmEnvLike = {};
		configureOrtWasmPaths(fakeOrt);
		expect(fakeOrt.wasmPaths).toBe("/ort/");
	});

	it("disables remote model fallback so a missing local weight fails closed (no HF fetch)", () => {
		// allowRemoteModels defaults to true in transformers.js — a missing local
		// weight would then be fetched from an UNPINNED model on huggingface.co. For
		// an AML tool that is unacceptable; the module-load side effect pins it off.
		expect(env.allowRemoteModels).toBe(false);
	});

	it("importing the embedder wires the REAL env.backends.onnx.wasm knob", () => {
		// Not a fake: this asserts the module-load side effect reached the live
		// transformers.js env, so onnxruntime-web dynamic-imports its wasm loader
		// from the staged same-origin /ort/ copy instead of the jsDelivr CDN. If
		// transformers.js ever moves the knob, this fails here — not in prod.
		const backends = env.backends as { onnx?: { wasm?: OrtWasmEnvLike } };
		expect(backends.onnx?.wasm?.wasmPaths).toBe("/ort/");
	});
});

describe("embedder pipeline caching + dimension guard", () => {
	it("loads the pipeline once and reuses the extractor across embeds", async () => {
		const load = vi.fn(async () => {
			return async (): Promise<{ data: ArrayLike<number> }> => ({
				data: new Float32Array(384),
			});
		});
		const embedder = createEmbedderWith(load);
		await embedder.embed("first query");
		await embedder.embed("second query");
		// The heavy load ran exactly once; the second embed reused the extractor.
		expect(load).toHaveBeenCalledTimes(1);
	});

	it("fail-closes on an embedding of the wrong dimension", async () => {
		const embedder = createEmbedderWith(async () => {
			return async (): Promise<{ data: ArrayLike<number> }> => ({
				data: new Float32Array(3),
			});
		});
		await expect(embedder.embed("query")).rejects.toThrow(
			/has 3 dims; expected 384/,
		);
	});
});

describe("pipeline options", () => {
	it("pins the shared dtype and omits progress_callback when no sink is wired", async () => {
		const { createEmbedderWithPipeline } = await import("./embedder");
		const load = vi.fn(async (_task: string, _model: string) => {
			return async (): Promise<{ data: ArrayLike<number> }> => ({
				data: new Float32Array(384),
			});
		});
		const embedder = createEmbedderWithPipeline(load);
		await embedder.embed("warm up");

		// No sink → the options carry ONLY the pinned dtype; a progress_callback
		// key must not appear (transformers.js treats its presence as opt-in).
		expect(load).toHaveBeenCalledWith("feature-extraction", EMBEDDING_MODEL, {
			dtype: EMBEDDING_DTYPE,
		});
	});

	it("createEmbedder builds a lazy embedder (no model load at construction)", () => {
		// The real ~23 MB pipeline is only loaded on the first embed; constructing
		// the default embedder must be free and synchronous.
		const embedder = createEmbedder();
		expect(typeof embedder.embed).toBe("function");
	});
});

describe("ortWasmEnv fail-loud (missing onnx wasm backend)", () => {
	it("importing against an env with no onnx.wasm node throws, not silently no-ops", async () => {
		// FAIL LOUD: a transformers.js env whose backends tree lacks the onnx.wasm
		// node must make the module-load side effect THROW — a silent inert `{}`
		// there would leave wasmPaths unset and let onnxruntime-web dynamic-import
		// its loader from the jsDelivr CDN (the §8.1b dependency this self-host
		// kills). A missing knob means the library moved it; that fails here.
		vi.resetModules();
		vi.doMock("@huggingface/transformers", () => ({
			env: { backends: {} },
			pipeline: vi.fn(),
		}));
		await expect(import("./embedder")).rejects.toThrow(
			/env\.backends\.onnx\.wasm.*unavailable/is,
		);
		vi.doUnmock("@huggingface/transformers");
		vi.resetModules();
	});
});
