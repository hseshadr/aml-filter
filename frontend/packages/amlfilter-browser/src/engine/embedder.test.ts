import { env, type ProgressInfo } from "@huggingface/transformers";
import { describe, expect, it, vi } from "vitest";
import {
	configureOrtWasmPaths,
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
	it("forwards a status:progress event to the construction-time onProgress", async () => {
		// The fake pipeline immediately fires a progress callback, exactly as
		// transformers.js does while downloading the ONNX weights.
		const { createEmbedderWithPipeline } = await import("./embedder");
		const onProgress = vi.fn();
		const fakePipeline = vi.fn(
			async (
				_task: string,
				_model: string,
				opts?: { progress_callback?: (i: ProgressInfo) => void },
			) => {
				opts?.progress_callback?.({
					status: "progress",
					name: "m",
					file: "f",
					progress: 60,
					loaded: 60,
					total: 100,
				});
				return async () => ({ data: new Float32Array(384) });
			},
		);
		const embedder = createEmbedderWithPipeline(fakePipeline, onProgress);
		await embedder.embed("warm up");

		expect(onProgress).toHaveBeenCalledWith({
			loaded: 60,
			total: 100,
			pct: 60,
		});
	});

	it("does not emit for a non-progress status during load", async () => {
		const { createEmbedderWithPipeline } = await import("./embedder");
		const onProgress = vi.fn();
		const fakePipeline = vi.fn(
			async (
				_task: string,
				_model: string,
				opts?: { progress_callback?: (i: ProgressInfo) => void },
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

	it("importing the embedder wires the REAL env.backends.onnx.wasm knob", () => {
		// Not a fake: this asserts the module-load side effect reached the live
		// transformers.js env, so onnxruntime-web dynamic-imports its wasm loader
		// from the staged same-origin /ort/ copy instead of the jsDelivr CDN. If
		// transformers.js ever moves the knob, this fails here — not in prod.
		const backends = env.backends as { onnx?: { wasm?: OrtWasmEnvLike } };
		expect(backends.onnx?.wasm?.wasmPaths).toBe("/ort/");
	});
});
