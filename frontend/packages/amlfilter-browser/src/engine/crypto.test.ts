// Fail-closed ed25519 verification, proven against the REAL committed signed
// demo BUNDLE's `/latest` version pointer (frontend/app/public/bundle/origin/
// latest) and the REAL pinned key the SPA ships (frontend/app/public/public.key).
// These two artifacts are signed/pinned as a PAIR: a re-publish of the bundle
// without re-pinning the key (or vice versa) silently breaks the live demo's
// fail-closed boot. This fast Node test catches that in the normal unit run — the
// signed-bundle drift guard. (The end-to-end pointer→manifest→chunk verify lives
// in sync/demoBundleParity.test.ts; this is the focused crypto contract.)

import { describe, expect, it } from "vitest";
import { SignatureError, sha256Hex, verifyEd25519 } from "./crypto";
import { pointerMessage, pointerSig, pubkeyRaw } from "./fixtures";

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

describe("verifyEd25519 against the REAL committed signed bundle pointer", () => {
	it("PASSES — the demo bundle pointer verifies against the pinned public.key", async () => {
		await expect(
			verifyEd25519(pubkeyRaw(), pointerMessage(), pointerSig()),
		).resolves.toBeUndefined();
	});

	it("THROWS fail-closed on a 1-byte-tampered signature", async () => {
		const sig = pointerSig();
		const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
		await expect(
			verifyEd25519(pubkeyRaw(), pointerMessage(), flipped),
		).rejects.toBeInstanceOf(SignatureError);
	});

	it("THROWS fail-closed when the signed message is tampered", async () => {
		const tampered = pointerMessage().slice();
		tampered[0] = (tampered[0] ?? 0) ^ 0xff;
		await expect(
			verifyEd25519(pubkeyRaw(), tampered, pointerSig()),
		).rejects.toBeInstanceOf(SignatureError);
	});

	it("THROWS fail-closed on a malformed (non-base64) signature", async () => {
		await expect(
			verifyEd25519(pubkeyRaw(), pointerMessage(), "!!!not base64!!!"),
		).rejects.toBeInstanceOf(SignatureError);
	});
});
