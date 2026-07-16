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

	it("accepts and verifies a chunk exactly at the decompressed ceiling", async () => {
		const zstd = await Zstd.load();
		const plaintext = new Uint8Array(EXPECTED_MAX_DECOMPRESSED_CHUNK_BYTES);
		const compressed = zstd.compress(plaintext);

		await expect(
			decompressAndVerify(await sha256Hex(plaintext), compressed),
		).resolves.toHaveLength(EXPECTED_MAX_DECOMPRESSED_CHUNK_BYTES);
	});
});
