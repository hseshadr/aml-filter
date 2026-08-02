import { describe, expect, it, vi } from "vitest";
import type { EmbedProgress } from "./embedder";
import {
	type FetchScope,
	isModelAssetUrl,
	MODEL_ASSET_PREFIX,
	withModelFetchProgress,
} from "./modelFetchProgress";

// The ~23 MB ONNX download is the ONLY part of the cold boot with no progress:
// transformers.js 4.2.0 duplicates the model fetch when `progress_callback` is
// passed (pipelines.js does a metadata pass per expected file, and with
// `allowLocalModels` that pass is a FULL same-origin GET whose body is never
// cancelled). So progress is metered at the TRANSPORT instead — the response
// body is teed and its bytes counted. These tests pin the two properties that
// make that safe: the sink actually moves, and the teed bytes are identical to
// what the server sent.

/** A response over a body split into chunks, so the tee has something to count. */
function streamed(
	chunks: ReadonlyArray<Uint8Array>,
	headers: Record<string, string>,
): Response {
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(chunk);
			}
			controller.close();
		},
	});
	return new Response(stream, { status: 200, headers });
}

function bytes(length: number, fill: number): Uint8Array {
	return new Uint8Array(length).fill(fill);
}

/** A scope whose fetch always answers with `response`, counting its calls. */
function scopeReturning(response: () => Response): {
	scope: FetchScope;
	calls: () => number;
	original: unknown;
} {
	let calls = 0;
	const original = (): Promise<Response> => {
		calls += 1;
		return Promise.resolve(response());
	};
	const scope: FetchScope = { fetch: original };
	return { scope, calls: () => calls, original };
}

const MODEL_URL = `${MODEL_ASSET_PREFIX}Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx`;

describe("isModelAssetUrl", () => {
	it.each([
		MODEL_URL,
		`https://aml-filter.com${MODEL_URL}`,
		`${MODEL_ASSET_PREFIX}Xenova/all-MiniLM-L6-v2/tokenizer.json`,
	])("matches the self-hosted model asset %s", (url) => {
		expect(isModelAssetUrl(url)).toBe(true);
	});

	it.each([
		"/ort/ort-wasm-simd-threaded.asyncify.wasm",
		"/bundle/origin/manifest.json",
		"/public.key",
		"https://evil.example.com/?next=/models/x",
		"not a url at all",
	])("leaves the unrelated request %s untracked", (url) => {
		expect(isModelAssetUrl(url)).toBe(false);
	});

	it("ignores a query string when matching the path", () => {
		expect(isModelAssetUrl(`${MODEL_URL}?v=2`)).toBe(true);
	});
});

describe("withModelFetchProgress", () => {
	it("reports advancing byte counts as the model body streams", async () => {
		const seen: EmbedProgress[] = [];
		const { scope } = scopeReturning(() =>
			streamed([bytes(40, 1), bytes(60, 2)], { "content-length": "100" }),
		);

		await withModelFetchProgress(
			scope,
			(p) => seen.push(p),
			async () => {
				await (await scope.fetch(MODEL_URL)).arrayBuffer();
			},
		);

		expect(seen.map((p) => p.loaded)).toEqual([40, 100]);
		expect(seen.map((p) => p.pct)).toEqual([40, 100]);
		expect(seen.at(-1)?.total).toBe(100);
	});

	it("delivers byte-for-byte identical content through the tee", async () => {
		// The load itself must not be corrupted: a teed stream that drops, reorders
		// or truncates a chunk would produce a silently wrong ONNX graph.
		const first = bytes(40, 7);
		const second = bytes(60, 9);
		const { scope } = scopeReturning(() =>
			streamed([first, second], { "content-length": "100" }),
		);

		let body = new Uint8Array();
		await withModelFetchProgress(
			scope,
			() => undefined,
			async () => {
				body = new Uint8Array(
					await (await scope.fetch(MODEL_URL)).arrayBuffer(),
				);
			},
		);

		expect(body).toEqual(new Uint8Array([...first, ...second]));
	});

	it("aggregates across the parallel tokenizer + model downloads", async () => {
		// transformers.js loads the tokenizer and the model concurrently
		// (pipelines.js `Promise.all`). Per-file percentages would make the banner
		// jump backwards when the small file finishes; the aggregate only grows.
		const seen: EmbedProgress[] = [];
		const queue = [
			streamed([bytes(10, 1)], { "content-length": "10" }),
			streamed([bytes(90, 2)], { "content-length": "90" }),
		];
		const scope: FetchScope = {
			fetch: () => {
				const next = queue.shift();
				return next === undefined
					? Promise.reject(new Error("unexpected extra fetch"))
					: Promise.resolve(next);
			},
		};

		await withModelFetchProgress(
			scope,
			(p) => seen.push(p),
			async () => {
				const a = await scope.fetch(`${MODEL_ASSET_PREFIX}m/tokenizer.json`);
				const b = await scope.fetch(MODEL_URL);
				await a.arrayBuffer();
				await b.arrayBuffer();
			},
		);

		expect(seen.map((p) => p.loaded)).toEqual([10, 100]);
		expect(seen.at(-1)).toEqual({ loaded: 100, total: 100, pct: 100 });
	});

	it.each([
		["URL", () => new URL(`https://aml-filter.com${MODEL_URL}`)],
		["Request", () => new Request(`https://aml-filter.com${MODEL_URL}`)],
	])("meters a %s input, not just a string", async (_label, make) => {
		// transformers.js passes `URL|string`; other callers pass a Request. All
		// three must resolve to the same path or metering silently misses the load.
		const seen: EmbedProgress[] = [];
		const { scope } = scopeReturning(() =>
			streamed([bytes(10, 1)], { "content-length": "10" }),
		);

		await withModelFetchProgress(
			scope,
			(p) => seen.push(p),
			async () => {
				await (await scope.fetch(make())).arrayBuffer();
			},
		);

		expect(seen).toStrictEqual([{ loaded: 10, total: 10, pct: 100 }]);
	});

	it("fetches each model asset exactly once (no duplicate 23 MB download)", async () => {
		const { scope, calls } = scopeReturning(() =>
			streamed([bytes(100, 1)], { "content-length": "100" }),
		);

		await withModelFetchProgress(
			scope,
			() => undefined,
			async () => {
				await (await scope.fetch(MODEL_URL)).arrayBuffer();
			},
		);

		expect(calls()).toBe(1);
	});

	it("reports bytes with no percentage when content-length is absent", async () => {
		// Never invent a denominator: a chunked response has no honest total, so
		// the banner shows bytes rather than a made-up percent.
		const seen: EmbedProgress[] = [];
		const { scope } = scopeReturning(() => streamed([bytes(40, 1)], {}));

		await withModelFetchProgress(
			scope,
			(p) => seen.push(p),
			async () => {
				await (await scope.fetch(MODEL_URL)).arrayBuffer();
			},
		);

		// toStrictEqual: `total`/`pct` must be ABSENT, not present-and-undefined.
		expect(seen).toStrictEqual([{ loaded: 40 }]);
	});

	it("ignores a compressed response, whose content-length is not the body size", async () => {
		// With `content-encoding: br` the header describes WIRE bytes while the
		// stream yields DECODED bytes. Counting one against the other would report
		// >100%; such a response is left untracked and untouched instead.
		const seen: EmbedProgress[] = [];
		const response = streamed([bytes(40, 1)], {
			"content-length": "10",
			"content-encoding": "br",
		});
		const { scope } = scopeReturning(() => response);

		let delivered: Response | undefined;
		await withModelFetchProgress(
			scope,
			(p) => seen.push(p),
			async () => {
				delivered = await scope.fetch(MODEL_URL);
				await delivered.arrayBuffer();
			},
		);

		expect(seen).toEqual([]);
		expect(delivered).toBe(response);
	});

	it("passes a non-model request straight through, unwrapped and uncounted", async () => {
		const seen: EmbedProgress[] = [];
		const response = streamed([bytes(40, 1)], { "content-length": "40" });
		const { scope } = scopeReturning(() => response);

		let delivered: Response | undefined;
		await withModelFetchProgress(
			scope,
			(p) => seen.push(p),
			async () => {
				delivered = await scope.fetch("/ort/ort-wasm-simd-threaded.wasm");
			},
		);

		expect(delivered).toBe(response);
		expect(seen).toEqual([]);
	});

	it("passes an error response through untouched", async () => {
		const seen: EmbedProgress[] = [];
		const missing = new Response("nope", { status: 404 });
		const { scope } = scopeReturning(() => missing);

		let delivered: Response | undefined;
		await withModelFetchProgress(
			scope,
			(p) => seen.push(p),
			async () => {
				delivered = await scope.fetch(MODEL_URL);
			},
		);

		expect(delivered).toBe(missing);
		expect(seen).toEqual([]);
	});

	it("restores the original fetch once the load succeeds", async () => {
		const { scope, original } = scopeReturning(() =>
			streamed([bytes(10, 1)], { "content-length": "10" }),
		);
		const during = await withModelFetchProgress(
			scope,
			() => undefined,
			async () => scope.fetch,
		);

		expect(during).not.toBe(original);
		expect(scope.fetch).toBe(original);
	});

	it("restores the original fetch when the load FAILS", async () => {
		// A model load that rejects (blocked CDN, timeout) must not leave a
		// permanently wrapped fetch behind — that would meter every later request.
		const { scope, original } = scopeReturning(() =>
			streamed([bytes(10, 1)], { "content-length": "10" }),
		);

		await expect(
			withModelFetchProgress(
				scope,
				() => undefined,
				async () => {
					throw new Error("model load failed");
				},
			),
		).rejects.toThrow(/model load failed/);
		expect(scope.fetch).toBe(original);
	});

	it("propagates a cancel through the tee to the underlying reader", async () => {
		// Aborting the load must release the network stream, not strand it.
		const cancel = vi.fn();
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(bytes(10, 1));
			},
			cancel,
		});
		const { scope } = scopeReturning(
			() =>
				new Response(stream, {
					status: 200,
					headers: { "content-length": "10" },
				}),
		);

		await withModelFetchProgress(
			scope,
			() => undefined,
			async () => {
				const res = await scope.fetch(MODEL_URL);
				await res.body?.cancel("aborted");
			},
		);

		expect(cancel).toHaveBeenCalled();
	});
});
