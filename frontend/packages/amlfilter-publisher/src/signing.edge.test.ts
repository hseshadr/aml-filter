// signBytes fails loud on a malformed key: an Ed25519 seed is exactly 32 raw
// bytes, and a truncated/oversized key must never silently sign. Throwaway
// in-test bytes only — no real key material.

import { describe, expect, test } from "vitest";
import { signBytes } from "./signing.ts";

describe("signBytes key validation", () => {
	test("rejects a key that is not exactly 32 bytes", async () => {
		await expect(
			signBytes(new Uint8Array(16).fill(1), new Uint8Array([1, 2, 3])),
		).rejects.toThrow("private key must be 32 raw bytes, got 16");
	});
});
