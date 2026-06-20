// Fail-closed ed25519 verification, proven against the REAL committed signed
// demo watchlist (frontend/app/public/watchlist/watchlist.json) and the REAL
// pinned key the /screen SPA ships (frontend/app/public/public.key). These two
// artifacts are signed/pinned as a PAIR: a re-publish of the watchlist without
// re-pinning the key (or vice versa) silently breaks the live demo's fail-closed
// boot. This fast Node test catches that in the normal unit run — the
// signed-JSON analogue of the old chunked-bundle drift guard.

import { describe, expect, it } from "vitest";
import { SignatureError, sha256Hex, verifyEd25519 } from "./crypto";
import { pubkeyRaw, watchlistBytes, watchlistSig } from "./fixtures";

describe("sha256Hex", () => {
	it("matches the known empty-string vector", async () => {
		expect(await sha256Hex(new Uint8Array(0))).toBe(
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		);
	});

	it("matches the known 'abc' vector", async () => {
		expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
	});
});

describe("verifyEd25519 against the REAL committed signed watchlist", () => {
	it("PASSES — the demo watchlist verifies against the pinned public.key", async () => {
		await expect(
			verifyEd25519(pubkeyRaw(), watchlistBytes(), watchlistSig()),
		).resolves.toBeUndefined();
	});

	it("THROWS fail-closed on a 1-byte-tampered signature", async () => {
		const sig = watchlistSig();
		const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
		await expect(
			verifyEd25519(pubkeyRaw(), watchlistBytes(), flipped),
		).rejects.toBeInstanceOf(SignatureError);
	});

	it("THROWS fail-closed when the signed message is tampered", async () => {
		const bytes = watchlistBytes();
		const tampered = bytes.slice();
		tampered[0] = (tampered[0] ?? 0) ^ 0xff;
		await expect(
			verifyEd25519(pubkeyRaw(), tampered, watchlistSig()),
		).rejects.toBeInstanceOf(SignatureError);
	});

	it("THROWS fail-closed on a malformed (non-base64) signature", async () => {
		await expect(
			verifyEd25519(pubkeyRaw(), watchlistBytes(), "!!!not base64!!!"),
		).rejects.toBeInstanceOf(SignatureError);
	});
});
