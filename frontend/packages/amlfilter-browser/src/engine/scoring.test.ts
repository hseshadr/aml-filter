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
		lexicalSimilarity: 1.0,
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
			query({ nameCanonical: "v ivanov", lexicalSimilarity: 0.5 }),
			PRESETS.balanced.weights,
		);
		const alias = result.reasons.find((r) => r.signal === "alias_match");
		expect(alias?.value).toBe("V. Ivanov");
	});

	it("an exact alias is not shadowed by an earlier substring alias (recall)", () => {
		// Regression guard: a partial/substring alias listed BEFORE the exact one
		// used to early-return at 0.5 and hide the exact 1.0 hit — dropping an
		// exact-alias-only entity to a half score. "ivan" is a substring of the
		// query "v ivanov" (partial, 0.5); "v ivanov" is the exact alias (1.0).
		const result = computeScore(
			entity({
				aliases: [
					{ name: "Ivan", name_canonical: "ivan", source: "OFAC" },
					{ name: "V. Ivanov", name_canonical: "v ivanov", source: "OFAC" },
				],
			}),
			query({ nameCanonical: "v ivanov", lexicalSimilarity: 0.5 }),
			PRESETS.balanced.weights,
		);
		const alias = result.reasons.find((r) => r.signal === "alias_match");
		// The EXACT alias wins, not the earlier substring alias.
		expect(alias?.value).toBe("V. Ivanov");
		// Full-weight exact contribution (0.35 * 1.0), not the 0.175 partial.
		expect(alias?.contribution).toBeCloseTo(0.35, 10);
	});

	// The point of raising alias_match. /screen sends a Balanced combined-score
	// floor of 0.30 (frontend/app/src/pages/strictness.ts, LEVEL.balanced.floor);
	// at the old 0.10 weight an exact hit on a name OFAC itself publishes could
	// not reach it whatever else was true, so the signal was decorative. The
	// literal 0.30 is pinned here on purpose — asserting against the weight
	// itself would pass at any weight.
	it("lets ONE exact alias hit clear the live Balanced search floor on its own", () => {
		const result = computeScore(
			entity({
				aliases: [
					{ name: "V. Ivanov", name_canonical: "v ivanov", source: "OFAC" },
				],
			}),
			// Nothing else helps: no vector signal, no lexical signal, no DOB,
			// no country. The alias is carrying the match by itself.
			query({
				nameCanonical: "v ivanov",
				vectorSimilarity: 0,
				lexicalSimilarity: 0,
			}),
			PRESETS.balanced.weights,
		);
		expect(result.score).toBeGreaterThan(0.3);
	});

	it("keeps the first substring alias when several partially hit and none is exact", () => {
		// With no exact alias, the first substring hit's name is kept (unchanged
		// behavior) and later partials do not override it.
		const result = computeScore(
			entity({
				aliases: [
					{
						name: "Vladimir Ivanov II",
						name_canonical: "vladimir ivanov ii",
						source: "OFAC",
					},
					{
						name: "Vladimir Ivanov Jr",
						name_canonical: "vladimir ivanov jr",
						source: "OFAC",
					},
				],
			}),
			query({ nameCanonical: "vladimir ivanov", lexicalSimilarity: 0.5 }),
			PRESETS.balanced.weights,
		);
		const alias = result.reasons.find((r) => r.signal === "alias_match");
		expect(alias?.value).toBe("Vladimir Ivanov II");
		// Half-weight substring contribution (0.35 * 0.5).
		expect(alias?.contribution).toBeCloseTo(0.175, 10);
	});

	// Sanctions feeds publish surname-first; users type given-name-first.
	// Canonicalization already deletes the comma that carried the convention, so
	// scoring one writing as a perfect hit and the other as nothing was an
	// artifact of string equality, not a judgement about the name.
	it("treats a REORDERED alias as a full match, not a miss", () => {
		const result = computeScore(
			entity({
				aliases: [
					{
						name: "SALIM, Ahmad Fuad",
						name_canonical: "salim ahmad fuad",
						source: "OFAC",
					},
				],
			}),
			query({ nameCanonical: "ahmad fuad salim" }),
			PRESETS.balanced.weights,
		);
		const alias = result.reasons.find((r) => r.signal === "alias_match");
		expect(alias?.contribution).toBeCloseTo(0.35, 10);
	});

	// The red run for the full tier. Jr / II / Sr are different people, and the
	// tier must refuse them. If this ever starts scoring 0.35, the 0.95 line in
	// scoring.ts has been loosened past the point where it discriminates.
	it("REFUSES the full tier for a name with an extra generational token", () => {
		const result = computeScore(
			entity({
				aliases: [
					{
						name: "Vladimir Ivanov II",
						name_canonical: "vladimir ivanov ii",
						source: "OFAC",
					},
				],
			}),
			query({ nameCanonical: "vladimir ivanov" }),
			PRESETS.balanced.weights,
		);
		const alias = result.reasons.find((r) => r.signal === "alias_match");
		expect(alias?.contribution).toBeLessThan(0.35);
	});

	it("scores a loosely-similar alias at the FUZZY tier, a quarter weight", () => {
		const result = computeScore(
			entity({
				aliases: [
					{
						name: "NASRALLAH, Hasan Abd-al-Karim",
						name_canonical: "nasrallah hasan abd-al-karim",
						source: "OFAC",
					},
				],
			}),
			query({ nameCanonical: "hassan nasralla" }),
			PRESETS.balanced.weights,
		);
		const alias = result.reasons.find((r) => r.signal === "alias_match");
		// 0.35 * 0.25 — deliberately half of what containment earns, because a
		// token-set ratio is a judgement about the strings, not a fact about them.
		expect(alias?.contribution).toBeCloseTo(0.0875, 10);
	});

	// The red run for the fuzzy tier. Two unrelated names must earn NO alias
	// signal at all — a tier that fires on strangers is not a signal.
	it("emits NO alias signal for an unrelated name", () => {
		const result = computeScore(
			entity({
				aliases: [
					{
						name: "NASRALLAH, Hasan",
						name_canonical: "nasrallah hasan",
						source: "OFAC",
					},
				],
			}),
			query({ nameCanonical: "zzyzx nobody" }),
			PRESETS.balanced.weights,
		);
		expect(
			result.reasons.find((r) => r.signal === "alias_match"),
		).toBeUndefined();
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
			query({ vectorSimilarity: 0.1, lexicalSimilarity: 0.1 }),
			PRESETS.balanced.weights,
		);
		expect(result.summary).toContain("Low confidence match");
	});
});
