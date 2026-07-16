import { afterEach, describe, expect, it, vi } from "vitest";
import { FETCH_TIMEOUT_MS, fetchBytes, NetworkError } from "./fetchBytes";

const EXPECTED_MAX_FETCH_BYTES = 1024 * 1024;

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("fetchBytes timeout", () => {
	it("rejects with a NetworkError 'timed out' message and aborts when fetch never resolves", async () => {
		vi.useFakeTimers();
		// A fetch that never settles, but observes the AbortController: when the
		// signal aborts it rejects (the real fetch's abort behavior).
		const fetchMock = vi.fn(
			(_url: string, init?: { signal?: AbortSignal }) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => {
						reject(new DOMException("aborted", "AbortError"));
					});
				}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const pending = fetchBytes("https://cdn.example/never");
		// Surface the rejection before advancing timers so it is observed.
		const isNetworkError = expect(pending).rejects.toBeInstanceOf(NetworkError);
		const isTimedOut = expect(pending).rejects.toThrow(/timed out/i);
		await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
		await isNetworkError;
		await isTimedOut;
	});

	it("passes an AbortSignal to fetch and aborts it on timeout", async () => {
		vi.useFakeTimers();
		let captured: AbortSignal | undefined;
		const fetchMock = vi.fn(
			(_url: string, init?: { signal?: AbortSignal }) =>
				new Promise<Response>((_resolve, reject) => {
					captured = init?.signal;
					init?.signal?.addEventListener("abort", () => {
						reject(new DOMException("aborted", "AbortError"));
					});
				}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const pending = fetchBytes("https://cdn.example/never");
		const assertion = expect(pending).rejects.toThrow();
		await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
		await assertion;
		expect(captured).toBeInstanceOf(AbortSignal);
		expect(captured?.aborted).toBe(true);
	});

	it("resolves to bytes and clears the timer when fetch is fast", async () => {
		const ok = new Response(new Uint8Array([1, 2, 3]), { status: 200 });
		const fetchMock = vi.fn(() => Promise.resolve(ok));
		vi.stubGlobal("fetch", fetchMock);

		const bytes = await fetchBytes("https://cdn.example/ok");
		expect(Array.from(bytes)).toEqual([1, 2, 3]);
	});

	it("keeps the deadline active until a stalled response body finishes", async () => {
		vi.useFakeTimers();
		let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				bodyController = controller;
			},
		});
		vi.stubGlobal(
			"fetch",
			vi.fn((_url: string, init?: RequestInit) => {
				init?.signal?.addEventListener("abort", () => {
					bodyController?.error(new DOMException("aborted", "AbortError"));
				});
				return Promise.resolve(new Response(body, { status: 200 }));
			}),
		);

		const pending = fetchBytes("https://cdn.example/stalled-body");
		const timedOut = expect(pending).rejects.toThrow(/timed out/i);
		await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
		await timedOut;
	});
});

describe("fetchBytes resource ceilings", () => {
	it("rejects an oversized declared Content-Length before reading the body", async () => {
		const response = new Response(new Uint8Array([1]), {
			status: 200,
			headers: { "Content-Length": String(EXPECTED_MAX_FETCH_BYTES + 1) },
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.resolve(response)),
		);

		await expect(
			fetchBytes("https://cdn.example/declared-too-large"),
		).rejects.toThrow(/byte limit/i);
	});

	it("rejects a chunked body as soon as accumulated bytes exceed the ceiling", async () => {
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array(EXPECTED_MAX_FETCH_BYTES));
				controller.enqueue(new Uint8Array([1]));
				controller.close();
			},
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.resolve(new Response(body, { status: 200 }))),
		);

		await expect(
			fetchBytes("https://cdn.example/chunked-too-large"),
		).rejects.toThrow(/byte limit/i);
	});

	it("accepts a body exactly at the byte ceiling", async () => {
		const expected = new Uint8Array(EXPECTED_MAX_FETCH_BYTES);
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.resolve(new Response(expected, { status: 200 }))),
		);

		await expect(
			fetchBytes("https://cdn.example/max-valid"),
		).resolves.toHaveLength(EXPECTED_MAX_FETCH_BYTES);
	});
});

describe("fetchBytes cache mode", () => {
	it("does NOT set a cache mode by default (immutable, hash-addressed URLs)", async () => {
		const ok = new Response(new Uint8Array([1]), { status: 200 });
		const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
			Promise.resolve(ok),
		);
		vi.stubGlobal("fetch", fetchMock);

		await fetchBytes("https://cdn.example/chunk/abc");

		expect(fetchMock.mock.calls[0]?.[1]?.cache).toBeUndefined();
	});

	it("forwards cache: 'no-store' to fetch when requested (mutable pointer)", async () => {
		const ok = new Response(new Uint8Array([1]), { status: 200 });
		const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
			Promise.resolve(ok),
		);
		vi.stubGlobal("fetch", fetchMock);

		await fetchBytes("https://cdn.example/latest", { cache: "no-store" });

		expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe("no-store");
	});
});

describe("fetchBytes failure classes (both recoverable NetworkErrors)", () => {
	it("wraps a network-level rejection (offline/DNS) in NetworkError", async () => {
		// The real fetch rejects with a TypeError when the origin is unreachable.
		const fetchMock = vi.fn(() =>
			Promise.reject(new TypeError("Failed to fetch")),
		);
		vi.stubGlobal("fetch", fetchMock);

		const pending = fetchBytes("https://cdn.example/offline");
		await expect(pending).rejects.toBeInstanceOf(NetworkError);
		await expect(pending).rejects.toThrow(/network unreachable/);
	});

	it("treats a non-2xx status as an unreachable origin, carrying the status", async () => {
		const notFound = new Response("nope", {
			status: 404,
			statusText: "Not Found",
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.resolve(notFound)),
		);

		const pending = fetchBytes("https://cdn.example/missing");
		await expect(pending).rejects.toBeInstanceOf(NetworkError);
		await expect(pending).rejects.toThrow(/404 Not Found/);
	});
});
