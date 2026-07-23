import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "./fetchWithTimeout.ts";

describe("fetchWithTimeout", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("returns the response and clears the deadline", async () => {
		vi.useFakeTimers();
		const response = new Response("ok", { status: 200 });
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

		await expect(
			fetchWithTimeout("https://example.test/feed", "feed", 50),
		).resolves.toBe(response);
		await vi.advanceTimersByTimeAsync(100);

		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.test/feed",
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});

	it("rejects with a bounded timeout error when an upstream hangs", async () => {
		vi.useFakeTimers();
		vi.spyOn(globalThis, "fetch").mockImplementation(
			async (_input, init) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(new DOMException("aborted", "AbortError")),
					);
				}),
		);

		const pending = fetchWithTimeout("https://example.test/feed", "EU", 50);
		const assertion = expect(pending).rejects.toThrow(
			"EU request timed out after 50ms",
		);
		await vi.advanceTimersByTimeAsync(50);
		await assertion;
	});
});
