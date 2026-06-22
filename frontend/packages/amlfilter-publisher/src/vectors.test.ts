// vectorsToBytes is the binary `vectors.f32` payload the content-addressed
// bundle stages: raw little-endian Float32, row-major (entities*dim). It must
// round-trip byte-for-byte with the base64 encoder and decode back to the same
// floats the in-tab consumer reads via `new Float32Array(bytes.buffer)`.

import { describe, expect, test } from "vitest";
import { createFakeEmbedder } from "./fakeEmbedder.ts";
import { packVectors, vectorsToBase64, vectorsToBytes } from "./vectors.ts";

describe("vectorsToBytes", () => {
	test("emits raw LE Float32 bytes, row-major (entities*dim)", () => {
		const dim = 3;
		const packed = new Float32Array([1, 2, 3, 4, 5, 6]); // 2 rows of dim=3
		const bytes = vectorsToBytes(packed);

		expect(bytes.byteLength).toBe(packed.length * 4);
		// Decoded floats equal the input, in row-major order.
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		for (let i = 0; i < packed.length; i += 1) {
			expect(view.getFloat32(i * 4, /* littleEndian */ true)).toBe(packed[i]);
		}
		// dim is purely a row stride; the byte payload carries no header.
		expect(bytes.byteLength).toBe((packed.length / dim) * dim * 4);
	});

	test("round-trips byte-for-byte with vectorsToBase64", () => {
		const packed = new Float32Array([0.5, -0.25, 1.5, -2]);
		const fromBase64 = Buffer.from(vectorsToBase64(packed), "base64");
		expect(Buffer.from(vectorsToBytes(packed))).toEqual(fromBase64);
	});

	test("decodes to the exact embedded floats (real packVectors path)", async () => {
		const names = ["alice", "bob"];
		const packed = await packVectors(createFakeEmbedder(), names);
		const bytes = vectorsToBytes(packed);
		const decoded = new Float32Array(
			bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
		);
		expect(decoded).toEqual(packed);
	});

	test("is deterministic for identical input", () => {
		const packed = new Float32Array([3, 1, 4, 1, 5, 9]);
		expect(Buffer.from(vectorsToBytes(packed))).toEqual(
			Buffer.from(vectorsToBytes(packed)),
		);
	});
});
