// Tests for the model-download prebuild script. Two halves:
//   1. Pure manifest/URL/decision logic — getting the manifest or the quantized
//      ONNX filename wrong would silently fall back to the HF CDN at runtime,
//      which is exactly the failure this task exists to remove.
//   2. Real I/O + failure-path behavior against a stub `fetch` and a temp dir:
//      sha-verified write, HTTP-error throw, corrupt-body (sha mismatch) reject,
//      skip-vs-refetch on hash match/mismatch, and the timeout/retry budget.
// No mock theater — the stubs return real bytes and we assert real on-disk state.

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	downloadModel,
	fetchBytes,
	HF_BASE,
	MAX_ATTEMPTS,
	MODEL_FILES,
	MODEL_ID,
	needsDownload,
	sha256Hex,
	sourceUrl,
	verifyDigest,
} from "./download-model.mjs";

const sha = (bytes: Uint8Array): string =>
	createHash("sha256").update(bytes).digest("hex");

/** A stub fetch that serves a fixed body per URL, or an HTTP error / throw. */
interface StubRoute {
	readonly body?: Uint8Array;
	readonly status?: number;
	readonly throws?: Error;
}

function makeFetch(
	routes: Map<string, StubRoute>,
	calls: string[],
): typeof fetch {
	const impl = async (input: string | URL | Request): Promise<Response> => {
		const url = typeof input === "string" ? input : input.toString();
		calls.push(url);
		const route = routes.get(url);
		if (route === undefined) {
			throw new Error(`no stub route for ${url}`);
		}
		if (route.throws !== undefined) {
			throw route.throws;
		}
		const status = route.status ?? 200;
		const ok = status >= 200 && status < 300;
		return {
			ok,
			status,
			statusText: ok ? "OK" : "Error",
			arrayBuffer: async () => (route.body ?? new Uint8Array()).buffer,
		} as unknown as Response;
	};
	return impl as unknown as typeof fetch;
}

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

	it("pins a 64-hex SHA-256 digest and a positive size for every file", () => {
		for (const file of MODEL_FILES) {
			expect(file.size).toBeGreaterThan(0);
			expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
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

describe("sha256Hex", () => {
	it("matches node's crypto for a known body", () => {
		const bytes = new TextEncoder().encode("hello");
		expect(sha256Hex(bytes)).toBe(sha(bytes));
	});
});

describe("needsDownload (sha256 idempotent skip)", () => {
	it("downloads when the file is absent (no on-disk digest)", () => {
		expect(needsDownload("abc", undefined)).toBe(true);
	});

	it("skips when the on-disk digest matches the pin", () => {
		expect(needsDownload("abc", "abc")).toBe(false);
	});

	it("re-downloads when the on-disk digest differs (present but wrong/corrupt)", () => {
		expect(needsDownload("abc", "def")).toBe(true);
	});
});

describe("verifyDigest", () => {
	const file = MODEL_FILES[0];

	it("returns the bytes when the digest matches", () => {
		const good = new TextEncoder().encode("payload");
		const pinned = { ...file, sha256: sha(good) };
		expect(verifyDigest(pinned, good)).toBe(good);
	});

	it("throws (and so never writes) on a sha mismatch", () => {
		const body = new TextEncoder().encode("corrupt");
		expect(() => verifyDigest(file, body)).toThrow(/sha256 mismatch/);
	});
});

describe("fetchBytes (timeout + bounded retry)", () => {
	it("returns the body on the first successful attempt", async () => {
		const body = new TextEncoder().encode("ok");
		const calls: string[] = [];
		const stub = makeFetch(new Map([["u", { body }]]), calls);
		const got = await fetchBytes("u", stub);
		expect(Array.from(got)).toEqual(Array.from(body));
		expect(calls).toHaveLength(1);
	});

	it("retries a transient failure then succeeds within the budget", async () => {
		const body = new TextEncoder().encode("ok");
		let n = 0;
		const flaky = (async () => {
			n += 1;
			if (n < 2) {
				throw new Error("transient");
			}
			return {
				ok: true,
				status: 200,
				statusText: "OK",
				arrayBuffer: async () => body.buffer,
			} as unknown as Response;
		}) as unknown as typeof fetch;
		const got = await fetchBytes("u", flaky);
		expect(Array.from(got)).toEqual(Array.from(body));
		expect(n).toBe(2);
	});

	it("throws after exhausting all attempts on a persistent stall", async () => {
		let n = 0;
		const dead = (async () => {
			n += 1;
			throw new Error("stalled");
		}) as unknown as typeof fetch;
		await expect(fetchBytes("u", dead)).rejects.toThrow(
			new RegExp(`failed after ${MAX_ATTEMPTS} attempts`),
		);
		expect(n).toBe(MAX_ATTEMPTS);
	});

	it("throws on an HTTP error status", async () => {
		const calls: string[] = [];
		const stub = makeFetch(new Map([["u", { status: 404 }]]), calls);
		await expect(fetchBytes("u", stub)).rejects.toThrow(/HTTP 404/);
	});
});

describe("downloadModel (I/O + failure paths over a temp dir)", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "dl-model-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	/** Map every manifest URL to a body, by a per-file transform. */
	const routesFor = (
		bodyFor: (f: (typeof MODEL_FILES)[number]) => StubRoute,
	): Map<string, StubRoute> => {
		const m = new Map<string, StubRoute>();
		for (const f of MODEL_FILES) {
			m.set(sourceUrl(f.path), bodyFor(f));
		}
		return m;
	};

	it("downloads, verifies, and writes every file when the dir is empty", async () => {
		// downloadModel uses the frozen MODEL_FILES with their real pinned digests,
		// so we serve the real mirror bytes (which hash to those pins) and assert the
		// files land on disk with the correct content.
		const real = await loadRealBodies();
		const calls: string[] = [];
		const stub = makeFetch(
			routesFor((f) => ({ body: real.get(f.path) })),
			calls,
		);
		await downloadModel(dir, stub);
		for (const f of MODEL_FILES) {
			const onDisk = await readFile(join(dir, f.path));
			expect(sha(new Uint8Array(onDisk))).toBe(f.sha256);
		}
		expect(calls).toHaveLength(MODEL_FILES.length);
	});

	/** Write the given body for every manifest file (creating onnx/ as needed). */
	const placeAll = async (
		bodyFor: (f: (typeof MODEL_FILES)[number]) => Uint8Array,
	): Promise<void> => {
		const { mkdir } = await import("node:fs/promises");
		await mkdir(join(dir, "onnx"), { recursive: true });
		for (const f of MODEL_FILES) {
			await writeFile(join(dir, f.path), bodyFor(f));
		}
	};

	it("skips a file already present with a matching sha (no fetch)", async () => {
		const real = await loadRealBodies();
		await placeAll((f) => real.get(f.path) ?? new Uint8Array());
		const calls: string[] = [];
		const stub = makeFetch(
			routesFor((f) => ({ body: real.get(f.path) })),
			calls,
		);
		await downloadModel(dir, stub);
		expect(calls).toHaveLength(0); // all skipped on sha match
	});

	it("refetches a present-but-corrupt file (wrong on-disk sha)", async () => {
		const real = await loadRealBodies();
		await placeAll(() => new TextEncoder().encode("corrupt"));
		const calls: string[] = [];
		const stub = makeFetch(
			routesFor((f) => ({ body: real.get(f.path) })),
			calls,
		);
		await downloadModel(dir, stub);
		// Every file was wrong → every file refetched and repaired.
		expect(calls).toHaveLength(MODEL_FILES.length);
		for (const f of MODEL_FILES) {
			const onDisk = await readFile(join(dir, f.path));
			expect(sha(new Uint8Array(onDisk))).toBe(f.sha256);
		}
	});

	it("aborts and writes nothing when a body fails sha verification", async () => {
		const calls: string[] = [];
		// Serve a wrong body for the FIRST file → mismatch on config.json.
		const stub = makeFetch(
			routesFor(() => ({ body: new TextEncoder().encode("wrong") })),
			calls,
		);
		await expect(downloadModel(dir, stub)).rejects.toThrow(/sha256 mismatch/);
		await expect(readFile(join(dir, MODEL_FILES[0].path))).rejects.toThrow();
	});

	it("aborts on an HTTP error from the hub", async () => {
		const calls: string[] = [];
		const stub = makeFetch(
			routesFor(() => ({ status: 503 })),
			calls,
		);
		await expect(downloadModel(dir, stub)).rejects.toThrow(/HTTP 503/);
	});
});

/**
 * Load the real, sha-verified bodies from the repo's public/models mirror so the
 * I/O tests serve bytes that hash to the actual pinned digests. The mirror is
 * git-ignored but always present after a `pnpm build`/`download-model` run (the
 * prebuild that these tests guard); if absent, the test fails loudly rather than
 * silently passing on synthetic data.
 */
async function loadRealBodies(): Promise<Map<string, Uint8Array>> {
	const { dirname } = await import("node:path");
	const { fileURLToPath } = await import("node:url");
	const here = dirname(fileURLToPath(import.meta.url));
	const base = join(here, "..", "public", "models", MODEL_ID);
	const m = new Map<string, Uint8Array>();
	for (const f of MODEL_FILES) {
		const bytes = new Uint8Array(await readFile(join(base, f.path)));
		if (sha(bytes) !== f.sha256) {
			throw new Error(
				`local mirror for ${f.path} does not match pinned sha256 — run download-model first`,
			);
		}
		m.set(f.path, bytes);
	}
	return m;
}
