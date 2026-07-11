// vectors defensive branches: a row whose embedding is not EMBEDDING_DIM wide
// fails loud with the row index; a hole in the names array embeds as "" rather
// than crashing; and on a (hypothetical) big-endian host vectorsToBytes refuses
// to emit byte-swapped payloads — simulated by faking node:os.endianness, the
// only way to exercise that guard on little-endian CI hosts.

import { EMBEDDING_DIM, type Embedder } from "@amlfilter/browser";
import { describe, expect, test, vi } from "vitest";
import { packVectors, vectorsToBytes } from "./vectors.ts";

vi.mock("node:os", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:os")>();
	return { ...actual, endianness: (): "BE" | "LE" => "BE" };
});

describe("packVectors", () => {
	test("rejects a row with the wrong embedding width", async () => {
		const shortEmbedder: Embedder = {
			embed: () => Promise.resolve(new Float32Array(3)),
		};
		await expect(packVectors(shortEmbedder, ["x"])).rejects.toThrow(
			`row 0: embedding has 3 dims; expected ${EMBEDDING_DIM}`,
		);
	});

	test("a hole in the names array embeds as the empty string", async () => {
		const seen: string[] = [];
		const recorder: Embedder = {
			embed: (text) => {
				seen.push(text);
				return Promise.resolve(new Float32Array(EMBEDDING_DIM));
			},
		};
		const holey: string[] = [];
		holey.length = 1; // one hole -> names[0] is undefined at runtime
		const packed = await packVectors(recorder, holey);
		expect(seen).toEqual([""]);
		expect(packed.length).toBe(EMBEDDING_DIM);
	});
});

describe("vectorsToBytes on a big-endian host", () => {
	test("refuses to emit a byte-swapped payload", () => {
		expect(() => vectorsToBytes(new Float32Array([1, 2]))).toThrow(
			"publisher requires a little-endian host",
		);
	});
});
