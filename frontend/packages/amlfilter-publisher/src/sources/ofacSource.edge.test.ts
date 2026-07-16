// ofacSource network + degenerate-input behavior, offline: fetchRaw pulls
// SDN.CSV + ALT.CSV off a stubbed fetch and keys them by file name; a non-OK
// response fails loud with the status; parse of a raw map missing both files
// degrades to an empty list (the `?? ""` contract).

import { afterEach, describe, expect, test, vi } from "vitest";
import { ofacSource } from "./ofacSource.ts";
import { SOURCE_UPDATED_AT_KEY } from "./source.ts";

describe("ofacSource.fetchRaw", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("returns both files keyed by name", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request): Promise<Response> => {
				const url = String(input);
				return new Response(
					url.includes("SDN.CSV") ? "sdn-bytes" : "alt-bytes",
					{
						headers: {
							"Last-Modified": url.includes("SDN.CSV")
								? "Wed, 01 Jul 2026 00:00:00 GMT"
								: "Thu, 02 Jul 2026 00:00:00 GMT",
						},
					},
				);
			}),
		);
		await expect(ofacSource.fetchRaw()).resolves.toEqual({
			"SDN.CSV": "sdn-bytes",
			"ALT.CSV": "alt-bytes",
			[SOURCE_UPDATED_AT_KEY]: "2026-07-01T00:00:00.000Z",
		});
	});

	test("rejects a response that cannot prove upstream freshness", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (): Promise<Response> => new Response("bytes")),
		);
		await expect(ofacSource.fetchRaw()).rejects.toThrow(
			/omitted Last-Modified/i,
		);
	});

	test("rejects with the status on a non-OK response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async (): Promise<Response> =>
					new Response("nope", {
						status: 503,
						statusText: "Service Unavailable",
					}),
			),
		);
		await expect(ofacSource.fetchRaw()).rejects.toThrow(
			"failed: 503 Service Unavailable",
		);
	});
});

describe("ofacSource.parse", () => {
	test("a raw map missing both files parses to an empty list", () => {
		expect(ofacSource.parse({}, "v1")).toEqual([]);
	});
});
