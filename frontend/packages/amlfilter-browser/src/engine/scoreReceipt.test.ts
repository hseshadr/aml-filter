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
