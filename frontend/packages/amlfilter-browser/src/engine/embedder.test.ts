import type { ProgressInfo } from "@huggingface/transformers";
import { describe, expect, it, vi } from "vitest";
import { mapProgress } from "./embedder";

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
