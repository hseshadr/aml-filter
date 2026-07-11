// The shared fail-closed content-address rule both CacheStore implementations
// route reads through: a chunk's name IS sha256(plaintext). The mismatch arm is
// unreachable through a well-behaved store (ingest already rejects bad bytes),
// so it is pinned here directly — it is the last line of defense against a
// corrupted or tampered stored object.

import { describe, expect, it } from "vitest";
import { sha256Hex } from "../crypto";
import { IntegrityError, verifyPlaintext } from "./integrity";

const PLAINTEXT = new TextEncoder().encode("verified watchlist bytes");

describe("verifyPlaintext content-address rule", () => {
	it("accepts plaintext whose sha256 matches the chunk name", async () => {
		const trueHash = await sha256Hex(PLAINTEXT);
		await expect(verifyPlaintext(trueHash, PLAINTEXT)).resolves.toBeUndefined();
	});

	it("rejects plaintext whose sha256 differs from the chunk name (fail-closed)", async () => {
		const wrongHash = "0".repeat(64);
		await expect(verifyPlaintext(wrongHash, PLAINTEXT)).rejects.toBeInstanceOf(
			IntegrityError,
		);
		await expect(verifyPlaintext(wrongHash, PLAINTEXT)).rejects.toThrow(
			/failed content-address check/,
		);
	});
});
