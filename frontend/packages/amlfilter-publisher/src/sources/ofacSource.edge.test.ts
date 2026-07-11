// ofacSource network + degenerate-input behavior, offline: fetchRaw pulls
// SDN.CSV + ALT.CSV off a stubbed fetch and keys them by file name; a non-OK
// response fails loud with the status; parse of a raw map missing both files
// degrades to an empty list (the `?? ""` contract).

import { afterEach, describe, expect, test, vi } from "vitest";
import { ofacSource } from "./ofacSource.ts";

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
				);
			}),
		);
		await expect(ofacSource.fetchRaw()).resolves.toEqual({
			"SDN.CSV": "sdn-bytes",
			"ALT.CSV": "alt-bytes",
		});
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
