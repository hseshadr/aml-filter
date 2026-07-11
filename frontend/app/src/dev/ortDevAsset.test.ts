import { resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveOrtAsset } from "./ortDevAsset";

const PUBLIC = resolve("/srv/app/public");
const ORT = resolve(PUBLIC, "ort");

describe("resolveOrtAsset — dev ORT middleware path guard", () => {
	it("resolves a staged .mjs loader to an in-bounds absolute path", () => {
		const asset = resolveOrtAsset(
			PUBLIC,
			"/ort/ort-wasm-simd-threaded.asyncify.mjs",
		);
		expect(asset).toEqual({
			file: resolve(ORT, "ort-wasm-simd-threaded.asyncify.mjs"),
			contentType: "text/javascript",
		});
	});

	it("resolves a staged .wasm asset with the wasm content type", () => {
		const asset = resolveOrtAsset(
			PUBLIC,
			"/ort/ort-wasm-simd-threaded.asyncify.wasm",
		);
		expect(asset?.contentType).toBe("application/wasm");
		expect(asset?.file.startsWith(ORT + sep)).toBe(true);
	});

	it("rejects a request outside /ort/", () => {
		expect(resolveOrtAsset(PUBLIC, "/models/model.wasm")).toBeNull();
	});

	it("rejects a non-.mjs/.wasm asset under /ort/", () => {
		expect(resolveOrtAsset(PUBLIC, "/ort/secret.json")).toBeNull();
	});

	it("rejects a path-traversal escape that still starts with /ort/ and ends .wasm", () => {
		// The adversarial case: a raw `..` a browser would normalize but curl sends.
		expect(
			resolveOrtAsset(PUBLIC, "/ort/../../../../etc/passwd.wasm"),
		).toBeNull();
	});

	it("rejects a sibling-prefix escape (/ort/../ortx/...)", () => {
		expect(resolveOrtAsset(PUBLIC, "/ort/../ortx/evil.mjs")).toBeNull();
	});
});
