import { describe, expect, it } from "vitest";
import {
	calculateAssayScore,
	SCORING_POLICY_VERSION,
	scoringPolicyDecision,
} from "./assayScoring";

const SIGNALS = {
	name_vector: 0.8,
	name_sequence: 0.6,
	alias_match: 1,
	dob_match: 0.5,
	country_match: 0.25,
} as const;

const WEIGHTS = {
	name_vector: 0.55,
	name_sequence: 0.2,
	alias_match: 0.35,
	dob_match: 0.1,
	country_match: 0.05,
} as const;

describe("AML scoring through the Assay additive contract", () => {
	it("returns the ordered five-term explanation and stable inputs hash", () => {
		const result = calculateAssayScore(SIGNALS, WEIGHTS);

		expect(result.method).toEqual({
			id: "additive",
			version: "amlfilter.additive.v2",
		});
		expect(result.score).toBe(0.9725);
		expect(result.clamp).toBe("clamp");
		expect(result.inputs_hash).toBe(
			"sha256:e87b7886e4796a97637deb790b605fe5dd504acb1a84ec7b62b84fc72f6f9fa7",
		);
		expect(result.components).toEqual([
			{
				id: "name_vector",
				raw: 0.8,
				normalized: null,
				declared_weight: null,
				operation: "add",
				coefficient: 0.55,
				contribution: 0.44000000000000006,
				contribution_interval: null,
			},
			{
				id: "name_sequence",
				raw: 0.6,
				normalized: null,
				declared_weight: null,
				operation: "add",
				coefficient: 0.2,
				contribution: 0.12,
				contribution_interval: null,
			},
			{
				id: "alias_match",
				raw: 1,
				normalized: null,
				declared_weight: null,
				operation: "add",
				coefficient: 0.35,
				contribution: 0.35,
				contribution_interval: null,
			},
			{
				id: "dob_match",
				raw: 0.5,
				normalized: null,
				declared_weight: null,
				operation: "add",
				coefficient: 0.1,
				contribution: 0.05,
				contribution_interval: null,
			},
			{
				id: "country_match",
				raw: 0.25,
				normalized: null,
				declared_weight: null,
				operation: "add",
				coefficient: 0.05,
				contribution: 0.0125,
				contribution_interval: null,
			},
		]);
	});

	it("clamps the additive score without changing its component evidence", () => {
		const result = calculateAssayScore(
			{ ...SIGNALS, name_sequence: 1, dob_match: 1, country_match: 1 },
			WEIGHTS,
		);

		expect(result.score).toBe(1);
		expect(
			result.components.map((component) => component.contribution),
		).toEqual([0.44000000000000006, 0.2, 0.35, 0.1, 0.05]);
	});

	it("derives the policy threshold and tier from the Assay result", () => {
		const result = calculateAssayScore(SIGNALS, WEIGHTS);

		expect(scoringPolicyDecision(result, 0.65)).toEqual({
			accepted: true,
			threshold: 0.65,
			tier: "STRONG",
		});
		expect(SCORING_POLICY_VERSION).toBe("amlfilter.additive.v2");
	});
});
