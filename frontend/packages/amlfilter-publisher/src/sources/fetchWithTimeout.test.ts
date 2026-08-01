import { afterEach, describe, expect, it, vi } from "vitest";
import { FEED_USER_AGENT, fetchWithTimeout } from "./fetchWithTimeout.ts";

/** Never sleep for real in a retry test. */
const noSleep = async (): Promise<void> => {};

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

// 2026-07-30 outage: every deploy died on `OFAC_SDN: required feed fetch
// failed: … 403 Forbidden`. Treasury moved the sanctions-list service behind an
// AWS WAF that BLOCKS clients presenting no browser User-Agent. A bare
// `fetch(url)` sends none, so the publisher was indistinguishable from a
// scraper. Identifying ourselves is the baseline every public feed expects, and
// a transient upstream blip must not be a one-shot kill for a release.
describe("fetchWithTimeout identifies itself to upstream feeds", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("sends an honest, contactable User-Agent on every feed request", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("ok", { status: 200 }));

		await fetchWithTimeout("https://example.test/feed", "OFAC");

		const init = fetchMock.mock.calls[0]?.[1];
		const sent = new Headers(init?.headers).get("user-agent");
		expect(sent).toBe(FEED_USER_AGENT);
		// Honest: names the project and gives upstream a way to reach us.
		expect(sent).toMatch(/aml-filter/i);
		expect(sent).toContain("https://aml-filter.com");
	});

	it("retries a transient upstream failure with growing backoff", async () => {
		const slept: number[] = [];
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(new Response("", { status: 503 }))
			.mockResolvedValueOnce(new Response("", { status: 503 }))
			.mockResolvedValueOnce(new Response("ok", { status: 200 }));

		const response = await fetchWithTimeout(
			"https://example.test/feed",
			"EU",
			50,
			{
				sleep: async (ms: number) => {
					slept.push(ms);
				},
			},
		);

		expect(response.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(slept).toHaveLength(2);
		expect(slept[1]).toBeGreaterThan(slept[0] as number);
	});

	it("retries a 403 block, then reports it with the status and label", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("", { status: 403 }));

		await expect(
			fetchWithTimeout("https://example.test/SDN.CSV", "OFAC", 50, {
				attempts: 3,
				sleep: noSleep,
			}),
		).rejects.toThrow(/OFAC.*403/s);
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	// The nastiest shape: a browser-looking request is not blocked but
	// CHALLENGED — HTTP 202 with an EMPTY body. `res.ok` is true, so the old
	// code would have handed 0 bytes to the CSV parser and failed far
	// downstream as "entity count 0 outside plausible range". Name it here.
	it("rejects an AWS WAF challenge instead of passing an empty body downstream", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("", {
				status: 202,
				headers: { "x-amzn-waf-action": "challenge" },
			}),
		);

		await expect(
			fetchWithTimeout("https://example.test/SDN.CSV", "OFAC", 50, {
				attempts: 2,
				sleep: noSleep,
			}),
		).rejects.toThrow(/WAF/i);
	});

	it.each([429, 500, 503])(
		"treats HTTP %i as worth another attempt",
		async (status) => {
			const fetchMock = vi
				.spyOn(globalThis, "fetch")
				.mockResolvedValue(new Response("", { status }));

			await expect(
				fetchWithTimeout("https://example.test/feed", "UN", 50, {
					attempts: 2,
					sleep: noSleep,
				}),
			).rejects.toThrow(String(status));
			expect(fetchMock).toHaveBeenCalledTimes(2);
		},
	);

	it("retries a connection-level error but not our own deadline", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockRejectedValue(new Error("ECONNRESET"));

		await expect(
			fetchWithTimeout("https://example.test/feed", "EU", 50, {
				attempts: 3,
				sleep: noSleep,
			}),
		).rejects.toThrow(/ECONNRESET/);
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("waits for real between attempts when no sleep is injected", async () => {
		vi.useFakeTimers();
		vi.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(new Response("", { status: 503 }))
			.mockResolvedValueOnce(new Response("ok", { status: 200 }));

		const pending = fetchWithTimeout("https://example.test/feed", "UK", 50, {
			attempts: 2,
		});
		await vi.advanceTimersByTimeAsync(1_000);
		await expect(pending).resolves.toMatchObject({ status: 200 });
	});

	it("does not burn retries on a permanent 404", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("", { status: 404 }));

		await expect(
			fetchWithTimeout("https://example.test/gone.csv", "UK", 50, {
				attempts: 4,
				sleep: noSleep,
			}),
		).rejects.toThrow(/404/);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
