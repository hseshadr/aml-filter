import type { Match } from "@amlfilter/browser";
import { describe, expect, it } from "vitest";
import {
	BALANCED_LOW_CONFIDENCE_LINE,
	LEVEL,
	partitionByConfidence,
	passesStrictness,
	STRICTNESS_LEVELS,
} from "./strictness";

// A Match double carrying only what the strictness layer reads: the combined
// score (partition), the name_trigram reason (lexical gate), and the primary
// name (token containment).
function matchDouble(
	score: number,
	trigram: number,
	primaryName = "Test Entity",
): Match {
	return {
		entity_id: `T:${primaryName}:${String(score)}`,
		score,
		entity_type: "PERSON",
		risk_category: "SANCTION",
		source_list: "DEMO",
		list_version: "demo-v1",
		primary_name: primaryName,
		aliases: [],
		countries: [],
		nationalities: [],
		dob: [],
		addresses: [],
		identifiers: { passport: [], national_id: [], other: {} },
		reasons: [
			{
				signal: "name_trigram",
				value: trigram,
				weight: 0.2,
				contribution: trigram * 0.2,
				description: `Trigram similarity: ${trigram.toFixed(3)}`,
			},
		],
		explanation: "",
	};
}

describe("strictness levels — the declared threshold contract", () => {
	it("declares every threshold inside its documented 0–1 range", () => {
		for (const level of STRICTNESS_LEVELS) {
			for (const value of [level.floor, level.minLexical, level.displayFloor]) {
				expect(value).toBeGreaterThanOrEqual(0);
				expect(value).toBeLessThanOrEqual(1);
			}
		}
	});

	it("puts Balanced's display line ABOVE its engine floor — the gap is the grouped band", () => {
		expect(LEVEL.balanced.displayFloor).toBe(BALANCED_LOW_CONFIDENCE_LINE);
		expect(LEVEL.balanced.displayFloor).toBeGreaterThan(LEVEL.balanced.floor);
	});

	it("aligns Balanced's display line with Strict's ENGINE floor (one shared definition of confident)", () => {
		expect(BALANCED_LOW_CONFIDENCE_LINE).toBe(LEVEL.strict.floor);
	});

	it("declares NO display line for Lenient and Strict — their rendering is unchanged", () => {
		expect(LEVEL.lenient.displayFloor).toBe(0);
		expect(LEVEL.strict.displayFloor).toBe(0);
	});
});

describe("partitionByConfidence — the presentation split (recall-preserving)", () => {
	it("groups sub-line Balanced matches, keeps at/above-line matches primary, preserves order, drops nothing", () => {
		const fuzzHigh = matchDouble(0.362, 0.36, "Fuzz High");
		const strong = matchDouble(0.7, 0.9, "Strong Hit");
		const fuzzLow = matchDouble(0.322, 0.36, "Fuzz Low");
		const { primary, lowConfidence } = partitionByConfidence(
			[strong, fuzzHigh, fuzzLow],
			LEVEL.balanced,
		);
		expect(primary).toEqual([strong]);
		expect(lowConfidence).toEqual([fuzzHigh, fuzzLow]);
		expect(primary.length + lowConfidence.length).toBe(3);
	});

	it("treats a match exactly AT the line as primary (>= semantics)", () => {
		const atLine = matchDouble(BALANCED_LOW_CONFIDENCE_LINE, 0.5, "At Line");
		const { primary, lowConfidence } = partitionByConfidence(
			[atLine],
			LEVEL.balanced,
		);
		expect(primary).toEqual([atLine]);
		expect(lowConfidence).toEqual([]);
	});

	it("keeps every Lenient match primary regardless of score (show-everything preserved)", () => {
		const weak = matchDouble(0.301, 0.1, "Weak");
		const { primary, lowConfidence } = partitionByConfidence(
			[weak],
			LEVEL.lenient,
		);
		expect(primary).toEqual([weak]);
		expect(lowConfidence).toEqual([]);
	});

	it("keeps every Strict match primary (its engine floor already enforces the line)", () => {
		const strictHit = matchDouble(0.41, 0.6, "Strict Hit");
		const { primary, lowConfidence } = partitionByConfidence(
			[strictHit],
			LEVEL.strict,
		);
		expect(primary).toEqual([strictHit]);
		expect(lowConfidence).toEqual([]);
	});
});

describe("passesStrictness — the lexical gate (moved intact from ScreenPage)", () => {
	it("keeps a match whose trigram clears the level's minLexical", () => {
		const close = matchDouble(0.55, 0.667, "Ivan Fakovich");
		expect(passesStrictness(close, "ivan fal", LEVEL.balanced)).toBe(true);
	});

	it("drops low-trigram vector noise at Balanced", () => {
		const noise = matchDouble(0.301, 0.261, "Hassan Pretendi");
		expect(passesStrictness(noise, "ivan fal", LEVEL.balanced)).toBe(false);
	});

	it("keeps a low-trigram match when a query token exactly matches a name token", () => {
		const org = matchDouble(0.301, 0.267, "Madeupistan Imaginary Bank");
		expect(passesStrictness(org, "bank", LEVEL.balanced)).toBe(true);
	});
});
