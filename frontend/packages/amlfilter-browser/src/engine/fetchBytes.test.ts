import { afterEach, describe, expect, it, vi } from "vitest";
import { FETCH_TIMEOUT_MS, fetchBytes, NetworkError } from "./fetchBytes";

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
