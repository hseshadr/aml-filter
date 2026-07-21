/**
 * @vitest-environment node
 *
 * WHY THIS ONE FILE OPTS OUT OF THE PACKAGE-WIDE jsdom ENVIRONMENT
 *
 * This suite is pure Ed25519 signing/verification — it touches no DOM, no
 * IndexedDB, no OPFS. Running it under jsdom does not make it more browser-like;
 * it makes it STRICTLY LESS faithful, because jsdom introduces a second
 * JavaScript realm that a real browser never has.
 *
 * The concrete failure jsdom caused (CI run 29797592065, three tests):
 *
 *   TypeError: Failed to execute 'digest' on 'SubtleCrypto': 2nd argument is
 *   not instance of ArrayBuffer, Buffer, TypedArray, or DataView.
 *     ❯ sha512Async @noble/ed25519@3.1.0/index.js:793
 *
 * @noble/ed25519 hashes via `subtle.digest('SHA-512', m.buffer)` — it passes a
 * bare ArrayBuffer (index.js:793). Under vitest's jsdom environment the test
 * realm's `ArrayBuffer` comes from the jsdom VM context, while `globalThis.
 * crypto.subtle` is Node's native `webcrypto.subtle` (verified: `crypto.subtle
 * === require('node:crypto').webcrypto.subtle` is true, and `Buffer.from([1])
 * instanceof Uint8Array` is FALSE — proof of the realm split). Node 22's
 * WebCrypto brand-check rejects that cross-realm ArrayBuffer.
 *
 * It is a HARNESS artifact, not a product defect, on three counts:
 *   1. A real browser has ONE realm, so `m.buffer` is always same-realm there.
 *   2. Node 24 accepts the cross-realm ArrayBuffer; Node 22.13.0 (frontend/
 *      .nvmrc, what CI installs) rejects it. Same commit, same lockfile — the
 *      Node version alone flips the result. That version skew is exactly why
 *      this passed on every local run and failed the moment CI executed it.
 *   3. Cross-realm *TypedArrays* are accepted on both; only the bare
 *      ArrayBuffer trips it. Nothing in this repo constructs that buffer —
 *      it is allocated and passed entirely inside @noble/ed25519.
 *
 * So there is no realm-safe buffer for aml-filter code to pass: the fix belongs
 * at the harness layer, and `node` is the environment whose single-realm shape
 * actually matches the browser for this module. The assertions below are
 * unchanged — nothing is skipped, loosened, or stubbed.
 *
 * Real-browser coverage is a SEPARATE obligation and is NOT satisfied by this
 * file. See the note in ./scoreReceipt.ts.
 */
import {
	generateSeedHex,
	publicKeyHex,
	ReplayMismatch,
	SignatureInvalid,
} from "@edgeproc/avow";
import { describe, expect, it } from "vitest";
import {
	type MatchScoreInput,
	matchScoreSubject,
	type ScoreReceiptContext,
	signMatchReceipt,
	verifyMatchReceipt,
} from "./scoreReceipt";

const MATCH: MatchScoreInput = { score: 0.87, tier: "STRONG" };
const CONTEXT: ScoreReceiptContext = {
	engineVersion: "4.0.0",
	watchlistVersion: "2026.06.09",
	inputsHash: "sha256:abc",
};

describe("matchScoreSubject", () => {
	it("carries the app-computed score, tier, and screening context verbatim", () => {
		const subject = matchScoreSubject(MATCH, CONTEXT);
		expect(subject).toEqual({
			kind: "aml.match_score",
			engine: "amlfilter-sequenceMatcher",
			engine_version: "4.0.0",
			watchlist_version: "2026.06.09",
			inputs_hash: "sha256:abc",
			score: 0.87,
			tier: "STRONG",
		});
	});

	it("is a pure function of its inputs (byte-identical subjects re-run)", () => {
		expect(matchScoreSubject(MATCH, CONTEXT)).toEqual(
			matchScoreSubject(MATCH, CONTEXT),
		);
	});
});

describe("signMatchReceipt + verifyMatchReceipt", () => {
	it("seals a score into a receipt that verifies offline under the pinned key", async () => {
		const seed = generateSeedHex();
		const pinned = await publicKeyHex(seed);
		const receipt = await signMatchReceipt(
			matchScoreSubject(MATCH, CONTEXT),
			seed,
		);

		expect(receipt.public_key).toBe(pinned);
		expect(receipt.payload.score).toBe(0.87);
		await expect(verifyMatchReceipt(receipt, pinned)).resolves.toBeUndefined();
	});

	it("REJECTS a tampered score (coded ReplayMismatch)", async () => {
		const seed = generateSeedHex();
		const pinned = await publicKeyHex(seed);
		const receipt = await signMatchReceipt(
			matchScoreSubject(MATCH, CONTEXT),
			seed,
		);
		const tampered = {
			...receipt,
			payload: { ...receipt.payload, score: 0.01 },
		};
		await expect(verifyMatchReceipt(tampered, pinned)).rejects.toBeInstanceOf(
			ReplayMismatch,
		);
	});

	it("REJECTS a receipt pinned to the wrong signer (coded SignatureInvalid)", async () => {
		const seed = generateSeedHex();
		const receipt = await signMatchReceipt(
			matchScoreSubject(MATCH, CONTEXT),
			seed,
		);
		const otherKey = await publicKeyHex(generateSeedHex());
		await expect(verifyMatchReceipt(receipt, otherKey)).rejects.toBeInstanceOf(
			SignatureInvalid,
		);
	});
});
