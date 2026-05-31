import { describe, expect, it } from "vitest";
import { ApiClient } from "./api";

// These tests exercise the ApiClient wrapper's observable behavior — how it
// manages the X-API-Key header — without hitting the network. We reach the
// axios instance through the public set/clear methods and assert the resulting
// default headers, which is the contract the rest of the app depends on.

interface HeaderBag {
	"X-API-Key"?: string;
}

function defaultHeaders(client: ApiClient): HeaderBag {
	// The axios instance is private; cast through unknown to read its defaults
	// for assertion purposes only (no `any`, keeps Biome happy).
	const internal = client as unknown as {
		client: { defaults: { headers: HeaderBag } };
	};
	return internal.client.defaults.headers;
}

describe("ApiClient", () => {
	it("sends no X-API-Key header when constructed without a key", () => {
		const client = new ApiClient();
		expect(defaultHeaders(client)["X-API-Key"]).toBeUndefined();
	});

	it("seeds the X-API-Key header when constructed with a key", () => {
		const client = new ApiClient("seed-key");
		expect(defaultHeaders(client)["X-API-Key"]).toBe("seed-key");
	});

	it("setApiKey updates the default X-API-Key header", () => {
		const client = new ApiClient();
		client.setApiKey("rotated-key");
		expect(defaultHeaders(client)["X-API-Key"]).toBe("rotated-key");
	});

	it("clearApiKey removes the default X-API-Key header", () => {
		const client = new ApiClient("to-be-cleared");
		client.clearApiKey();
		expect(defaultHeaders(client)["X-API-Key"]).toBeUndefined();
	});
});
