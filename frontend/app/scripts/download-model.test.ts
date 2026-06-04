// Unit tests for the model-download prebuild script's pure logic: the file
// manifest the runtime depends on, the hub URL shaping, and the idempotent-skip
// decision. These assert real behavior (no mocks) — getting the manifest or the
// quantized ONNX filename wrong would silently fall back to the HF CDN at runtime,
// which is exactly the failure this task exists to remove.

import { describe, expect, it } from "vitest";
import {
	HF_BASE,
	MODEL_FILES,
	MODEL_ID,
	needsDownload,
	sourceUrl,
} from "./download-model.mjs";

describe("download-model manifest", () => {
	it("targets the Xenova MiniLM model id", () => {
		expect(MODEL_ID).toBe("Xenova/all-MiniLM-L6-v2");
	});

	it("mirrors exactly the files a wasm feature-extraction pipeline requests", () => {
		const paths = MODEL_FILES.map((f) => f.path);
		expect(paths).toEqual([
			"config.json",
			"tokenizer.json",
			"tokenizer_config.json",
			"special_tokens_map.json",
			"onnx/model_quantized.onnx",
		]);
	});

	it("requests the quantized ONNX export (the wasm/q8 default), not fp32", () => {
		const onnx = MODEL_FILES.find((f) => f.path.endsWith(".onnx"));
		expect(onnx?.path).toBe("onnx/model_quantized.onnx");
	});

	it("declares a positive expected size for every file", () => {
		for (const file of MODEL_FILES) {
			expect(file.size).toBeGreaterThan(0);
		}
	});
});

describe("sourceUrl", () => {
	it("resolves a file against the hub's main revision", () => {
		expect(sourceUrl("config.json")).toBe(
			`${HF_BASE}/${MODEL_ID}/resolve/main/config.json`,
		);
	});

	it("preserves the onnx/ subpath", () => {
		expect(sourceUrl("onnx/model_quantized.onnx")).toBe(
			`${HF_BASE}/${MODEL_ID}/resolve/main/onnx/model_quantized.onnx`,
		);
	});
});

describe("needsDownload (idempotent skip)", () => {
	it("downloads when the file is absent", () => {
		expect(needsDownload(650, undefined)).toBe(true);
	});

	it("skips when the on-disk file meets its expected size", () => {
		expect(needsDownload(650, 650)).toBe(false);
	});

	it("skips when the on-disk file exceeds its expected size", () => {
		expect(needsDownload(650, 700)).toBe(false);
	});

	it("re-downloads a truncated (short) file", () => {
		expect(needsDownload(650, 100)).toBe(true);
	});
});
