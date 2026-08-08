import { EMPTY_IDENTIFIERS, type Match } from "@amlfilter/browser";
import { describe, expect, it } from "vitest";
import { isKept, isPrimary, lexicalOf, tokenContainmentOf } from "./decide.ts";
import { DECISION_LEVELS } from "./levels.ts";

const BALANCED = DECISION_LEVELS[1];
const STRICT = DECISION_LEVELS[2];
const LENIENT = DECISION_LEVELS[0];

function match(overrides: Partial<Match> = {}): Match {
	return {
		entity_id: "OFAC_SDN:1",
		score: 0.5,
		entity_type: "PERSON",
		risk_category: "SANCTION",
		source_list: "OFAC_SDN",
		list_version: "v1",
		primary_name: "IVANOV, Vladimir",
		aliases: [],
		countries: [],
		nationalities: [],
		dob: [],
		addresses: [],
		identifiers: EMPTY_IDENTIFIERS,
		reasons: [],
		explanation: "",
		...overrides,
	} as Match;
}

describe("lexicalOf", () => {
	it("reads the name_trigram signal the app's gate reads", () => {
		const m = match({
			reasons: [
				{
					signal: "name_vector",
					value: 0.9,
					weight: 0.55,
					contribution: 0.5,
					description: "",
				},
				{
					signal: "name_trigram",
					value: 0.42,
					weight: 0.2,
					contribution: 0.08,
					description: "",
				},
			],
		});
		expect(lexicalOf(m)).toBe(0.42);
	});

	it("is 0 when the signal is absent or not numeric", () => {
		expect(lexicalOf(match({ reasons: [] }))).toBe(0);
		expect(
			lexicalOf(
				match({
					reasons: [
						{
							signal: "name_trigram",
							value: "x",
							weight: 0,
							contribution: 0,
							description: "",
						},
					],
				}),
			),
		).toBe(0);
	});
});

describe("tokenContainmentOf", () => {
	it("fires on a whole canonical token of the primary name", () => {
		expect(tokenContainmentOf(match(), "Vladimir Petrov")).toBe(true);
	});

	it("fires on a token of a published alias, not just the primary name", () => {
		const m = match({
			primary_name: "AL-ZAWAHIRI, Ayman",
			aliases: ["SALIM, Ahmad Fuad"],
		});
		expect(tokenContainmentOf(m, "Ahmad Nobody")).toBe(true);
	});

	it("does not fire on a partial token", () => {
		expect(tokenContainmentOf(match(), "Vlad Petrov")).toBe(false);
	});

	it("does not fire when nothing overlaps", () => {
		expect(tokenContainmentOf(match(), "Zzyzx Nobody")).toBe(false);
	});
});

describe("isKept", () => {
	it("refuses a match under the level's combined-score floor", () => {
		const facts = { score: 0.29, lexical: 1, tokenContainment: true };
		expect(isKept(facts, BALANCED)).toBe(false);
	});

	it("keeps a match exactly AT the floor", () => {
		expect(
			isKept({ score: 0.3, lexical: 1, tokenContainment: false }, BALANCED),
		).toBe(true);
	});

	it("refuses a low-lexical match that no token rescues", () => {
		expect(
			isKept({ score: 0.9, lexical: 0.34, tokenContainment: false }, BALANCED),
		).toBe(false);
	});

	it("keeps a low-lexical match when a whole token matches", () => {
		expect(
			isKept({ score: 0.9, lexical: 0.0, tokenContainment: true }, BALANCED),
		).toBe(true);
	});

	it("keeps everything above the floor at Lenient — there is no lexical gate", () => {
		expect(
			isKept({ score: 0.3, lexical: 0, tokenContainment: false }, LENIENT),
		).toBe(true);
	});

	it("applies Strict's higher floor and gate", () => {
		expect(
			isKept({ score: 0.39, lexical: 1, tokenContainment: true }, STRICT),
		).toBe(false);
		expect(
			isKept({ score: 0.45, lexical: 0.49, tokenContainment: false }, STRICT),
		).toBe(false);
		expect(
			isKept({ score: 0.45, lexical: 0.5, tokenContainment: false }, STRICT),
		).toBe(true);
	});
});

describe("isPrimary", () => {
	it("groups a kept Balanced match below the low-confidence line", () => {
		const facts = { score: 0.35, lexical: 0.9, tokenContainment: false };
		expect(isKept(facts, BALANCED)).toBe(true);
		expect(isPrimary(facts, BALANCED)).toBe(false);
	});

	it("leads with a kept match exactly AT the line", () => {
		expect(
			isPrimary(
				{ score: 0.4, lexical: 0.9, tokenContainment: false },
				BALANCED,
			),
		).toBe(true);
	});

	it("never promotes a match the gate refused", () => {
		expect(
			isPrimary({ score: 0.9, lexical: 0, tokenContainment: false }, BALANCED),
		).toBe(false);
	});

	it("is the identity split where displayFloor is 0", () => {
		const facts = { score: 0.3, lexical: 0, tokenContainment: false };
		expect(isPrimary(facts, LENIENT)).toBe(isKept(facts, LENIENT));
	});
});
