import { describe, expect, it } from "vitest";
import type { Entity } from "./domain";
import { computeScore, PRESETS, type ScoringQuery } from "./scoring";

function entity(overrides: Partial<Entity> = {}): Entity {
	return {
		entity_id: "e1",
		entity_type: "PERSON",
		primary_name: "Vladimir Ivanov",
		name_canonical: "vladimir ivanov",
		aliases: [],
		dob: [],
		countries: [],
		risk_category: "SANCTION",
		source_list: "OFAC_SDN",
		list_version: "2026-05-30",
		...overrides,
	};
}

function query(overrides: Partial<ScoringQuery> = {}): ScoringQuery {
	return {
		nameCanonical: "vladimir ivanov",
		dob: null,
		country: null,
		entityType: null,
		vectorSimilarity: 1.0,
		trigramSimilarity: 1.0,
		...overrides,
	};
}

describe("computeScore — explainable weighted signals", () => {
	it("always emits name_vector + name_trigram + entity_type_match signals", () => {
		const result = computeScore(entity(), query(), PRESETS.balanced.weights);
		const signals = result.reasons.map((r) => r.signal);
		expect(signals).toContain("name_vector");
		expect(signals).toContain("name_trigram");
		expect(signals).toContain("entity_type_match");
	});

	it("a perfect name match clears the balanced threshold", () => {
		const result = computeScore(entity(), query(), PRESETS.balanced.weights);
		// 0.55*1 + 0.20*1 = 0.75 from name signals alone
		expect(result.score).toBeGreaterThanOrEqual(0.75);
		expect(result.summary).toContain("strong vector similarity");
	});

	it("clamps the total score into [0, 1]", () => {
		const result = computeScore(
			entity({ countries: ["RU"], dob: ["1970-01-01"] }),
			query({ country: "RU", dob: "1970-01-01" }),
			PRESETS.lenient.weights,
		);
		expect(result.score).toBeLessThanOrEqual(1.0);
	});

	it("adds an alias_match signal on an exact alias hit", () => {
		const result = computeScore(
			entity({
				aliases: [
					{ name: "V. Ivanov", name_canonical: "v ivanov", source: "OFAC" },
				],
			}),
			query({ nameCanonical: "v ivanov", trigramSimilarity: 0.5 }),
			PRESETS.balanced.weights,
		);
		const alias = result.reasons.find((r) => r.signal === "alias_match");
		expect(alias?.value).toBe("V. Ivanov");
	});

	it("scores a year-only DOB match at half", () => {
		const result = computeScore(
			entity({ dob: ["1970-06-15"] }),
			query({ dob: "1970-01-01" }),
			PRESETS.balanced.weights,
		);
		const dob = result.reasons.find((r) => r.signal === "dob_match");
		expect(dob?.value).toBe(0.5);
		expect(dob?.description).toContain("Year match");
	});

	it("a low-similarity miss yields a low-confidence summary", () => {
		const result = computeScore(
			entity(),
			query({ vectorSimilarity: 0.1, trigramSimilarity: 0.1 }),
			PRESETS.balanced.weights,
		);
		expect(result.summary).toContain("Low confidence match");
	});
});
