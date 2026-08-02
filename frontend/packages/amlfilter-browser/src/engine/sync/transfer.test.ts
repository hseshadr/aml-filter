import { describe, expect, it } from "vitest";
import { toErrorResponse } from "./errorEnvelope";
import type { EngineResponse } from "./protocol";
import { transferables } from "./transfer";

describe("transferables", () => {
	it("transfers a readFile reply's backing buffer (zero-copy across the Worker boundary)", () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const response: EngineResponse = {
			ok: true,
			id: 1,
			kind: "readFile",
			bytes,
		};
		expect(transferables(response)).toEqual([bytes.buffer]);
	});

	it("transfers nothing for a small sync reply (no large buffer to hand off)", () => {
		const response: EngineResponse = {
			ok: true,
			id: 2,
			kind: "sync",
			result: {
				version: "v1",
				manifestHash: "h",
				chunksFetched: 0,
				chunksReused: 0,
				bytesFetched: 0,
			},
		};
		expect(transferables(response)).toEqual([]);
	});

	it("transfers nothing for a clear reply", () => {
		expect(transferables({ ok: true, id: 3, kind: "clear" })).toEqual([]);
	});

	it("transfers nothing for an error reply", () => {
		expect(transferables(toErrorResponse(4, new Error("boom")))).toEqual([]);
	});
});
