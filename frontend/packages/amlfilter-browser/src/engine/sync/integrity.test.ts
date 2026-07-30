import { Zstd } from "@hpcc-js/wasm-zstd";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../crypto";
import { decompressAndVerify, IntegrityError } from "./integrity";

const EXPECTED_MAX_COMPRESSED_CHUNK_BYTES = 512 * 1024;
const EXPECTED_MAX_DECOMPRESSED_CHUNK_BYTES = 256 * 1024;

describe("decompressAndVerify resource ceilings", () => {
	it("rejects compressed input beyond the transport-independent chunk ceiling", async () => {
		const oversized = new Uint8Array(EXPECTED_MAX_COMPRESSED_CHUNK_BYTES + 1);

		await expect(
			decompressAndVerify("0".repeat(64), oversized),
		).rejects.toThrow(/compressed byte limit/i);
	});

	it("rejects a valid zstd frame whose declared output exceeds the chunk ceiling", async () => {
		const zstd = await Zstd.load();
		const plaintext = new Uint8Array(EXPECTED_MAX_DECOMPRESSED_CHUNK_BYTES + 1);
		const compressed = zstd.compress(plaintext);

		await expect(
			decompressAndVerify(await sha256Hex(plaintext), compressed),
		).rejects.toBeInstanceOf(IntegrityError);
		await expect(
			decompressAndVerify(await sha256Hex(plaintext), compressed),
		).rejects.toThrow(/decompressed byte limit/i);
	});

	it("rejects a tiny hostile frame that declares a huge output", async () => {
		// The decompression-bomb shape: ~147 compressed bytes declaring 4 MiB.
		// Rejected on its DECLARATION, before a byte reaches the decoder.
		const zstd = await Zstd.load();
		const bomb = zstd.compress(new Uint8Array(4 * 1024 * 1024));
		expect(bomb.byteLength).toBeLessThan(1024);

		await expect(decompressAndVerify("0".repeat(64), bomb)).rejects.toThrow(
			/decompressed byte limit/i,
		);
	});

	it("rejects a chunk that does not bind its own decompressed size", async () => {
		// Streaming compression omits Frame_Content_Size, so no limit can be
		// enforced ahead of decoding. Fail closed rather than decode blind.
		const zstd = await Zstd.load();
		zstd.resetCompression();
		const head = zstd.compressChunk(new Uint8Array(5000));
		const tail = zstd.compressEnd();
		const streamed = new Uint8Array(head.byteLength + tail.byteLength);
		streamed.set(head, 0);
		streamed.set(tail, head.byteLength);

		await expect(decompressAndVerify("0".repeat(64), streamed)).rejects.toThrow(
			/does not declare a decompressed size/i,
		);
	});

	it("accepts and verifies a chunk exactly at the decompressed ceiling", async () => {
		const zstd = await Zstd.load();
		const plaintext = new Uint8Array(EXPECTED_MAX_DECOMPRESSED_CHUNK_BYTES);
		const compressed = zstd.compress(plaintext);

		await expect(
			decompressAndVerify(await sha256Hex(plaintext), compressed),
		).resolves.toHaveLength(EXPECTED_MAX_DECOMPRESSED_CHUNK_BYTES);
	});
});
