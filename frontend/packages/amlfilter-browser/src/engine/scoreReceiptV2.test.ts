/** @vitest-environment node */

import { generateSeedHex, publicKeyHex, signPayload } from "@edgeproc/avow";
import { describe, expect, it } from "vitest";
import { calculateAssayScore } from "./assayScoring";
import {
	MatchScoreEvidenceInvalid,
	type MatchScoreSubject,
	matchScoreSubject,
	signMatchReceipt,
	verifyMatchReceipt,
} from "./scoreReceipt";

const EVIDENCE = calculateAssayScore(
	{
		name_vector: 0.8,
		name_sequence: 0.6,
		alias_match: 1,
		dob_match: 0.5,
		country_match: 0.25,
	},
	{
		name_vector: 0.55,
		name_sequence: 0.2,
		alias_match: 0.35,
		dob_match: 0.1,
		country_match: 0.05,
	},
);

const CONTEXT = {
	engineVersion: "4.0.0",
	watchlistVersion: "OFAC@2026.08.24",
	inputsHash:
		"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
};

describe("Assay-backed match score receipt", () => {
	it("seals the exact five-term Assay result with the policy decision", () => {
		const subject = matchScoreSubject(
			{ score: EVIDENCE.score, tier: "STRONG", assay: EVIDENCE },
			CONTEXT,
		);

		expect(subject.assay?.method.version).toBe("amlfilter.additive.v2");
		expect(subject.assay?.inputs_hash).toBe(EVIDENCE.inputs_hash);
		expect(subject.assay?.components.map((component) => component.id)).toEqual([
			"name_vector",
			"name_sequence",
			"alias_match",
			"dob_match",
			"country_match",
		]);
	});

	it("rejects a valid signature over score evidence that disagrees with the score", async () => {
		const seed = generateSeedHex();
		const pinned = await publicKeyHex(seed);
		const subject = matchScoreSubject(
			{ score: EVIDENCE.score, tier: "STRONG", assay: EVIDENCE },
			CONTEXT,
		);
		const inconsistent = {
			...subject,
			assay: { ...EVIDENCE, score: 0.01 },
		} as MatchScoreSubject;
		const receipt = await signPayload(inconsistent, seed);

		await expect(verifyMatchReceipt(receipt, pinned)).rejects.toBeInstanceOf(
			MatchScoreEvidenceInvalid,
		);
	});

	it("verifies an untampered Assay-backed receipt offline", async () => {
		const seed = generateSeedHex();
		const pinned = await publicKeyHex(seed);
		const subject = matchScoreSubject(
			{ score: EVIDENCE.score, tier: "STRONG", assay: EVIDENCE },
			CONTEXT,
		);

		await expect(
			verifyMatchReceipt(await signMatchReceipt(subject, seed), pinned),
		).resolves.toBeUndefined();
	});
});
