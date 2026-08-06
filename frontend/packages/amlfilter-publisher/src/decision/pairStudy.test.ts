import { describe, expect, it } from "vitest";
import { buildOwnerIndex } from "../recall/labels.ts";
import type { SourceLine } from "../sources/source.ts";
import { aliasPairs, crossPersonPairs, scorePair } from "./pairStudy.ts";

function person(
	id: string,
	primary: string,
	aliases: string[] = [],
): SourceLine {
	return {
		entity_id: id,
		primary_name: primary,
		entity_type: "PERSON",
		aliases: aliases.map((name) => ({ name })),
		dob: [],
		countries: [],
		risk_category: "SANCTIONS",
		source_list: "OFAC_SDN",
		list_version: "v1",
	};
}

describe("scorePair", () => {
	it("scores the token_set tier the engine decides with", () => {
		const pair = scorePair("musa muhammad abu marzuk", "marzuk musa abu", 1);
		expect(pair.label).toBe(1);
		expect(pair.tokenSet).toBeGreaterThanOrEqual(0.6);
	});

	it("keeps token_sort separate — it is a different tier", () => {
		const pair = scorePair("vladimir ivanov", "ivanov vladimir", 1);
		expect(pair.tokenSort).toBeGreaterThanOrEqual(0.95);
	});

	it("reports the phonetic-key overlap the engine refuses to decide with", () => {
		expect(scorePair("muhammad ali", "mohammed ali", 1).sharedPhoneticKey).toBe(
			true,
		);
		expect(
			scorePair("zhang wei", "olafur bjornsson", 0).sharedPhoneticKey,
		).toBe(false);
	});
});

describe("aliasPairs", () => {
	it("pairs each designation's primary name with each published alias", () => {
		const pairs = aliasPairs([
			person("1", "IVANOV, Vladimir", ["Volodya Ivanov", "V. Ivanov"]),
		]);
		expect(pairs).toHaveLength(2);
		expect(pairs.every((p) => p.label === 1)).toBe(true);
	});

	it("drops an alias that canonicalizes to its own primary name", () => {
		// Same string: it measures exact equality, not the spelling-variant
		// problem, and counting it would inflate recall with a solved case.
		expect(
			aliasPairs([person("1", "IVANOV, Vladimir", ["Ivanov, Vladimir"])]),
		).toHaveLength(0);
	});

	it("ignores a designation with no aliases", () => {
		expect(aliasPairs([person("1", "IVANOV, Vladimir")])).toHaveLength(0);
	});
});

describe("crossPersonPairs", () => {
	const corpus = [
		person("1", "IVANOV, Vladimir"),
		person("2", "PETROV, Sergei"),
		person("3", "SOKOLOV, Mikhail"),
		person("4", "SMIRNOV, Andrei"),
	];

	it("is deterministic and labels every pair negative", () => {
		const a = crossPersonPairs(corpus, buildOwnerIndex(corpus), 20, 3);
		const b = crossPersonPairs(corpus, buildOwnerIndex(corpus), 20, 3);
		expect(a).toEqual(b);
		expect(a.every((p) => p.label === 0)).toBe(true);
	});

	it("REFUSES a pair whose two names are published by the same designation", () => {
		// A name string both designations publish is the ambiguity the labels
		// already model, not a cross-person pair; scoring it as a negative would
		// charge the matcher a false positive for a correct answer.
		const shared = [
			person("1", "IVANOV, Vladimir", ["Mohammed Ali"]),
			person("2", "ALI, Mohammed", ["Ivanov, Vladimir"]),
		];
		const owners = buildOwnerIndex(shared);
		const pairs = crossPersonPairs(shared, owners, 4, 5);
		expect(pairs).toHaveLength(4);
		// Every surviving pair must have at least one name unshared between the two.
		expect(pairs.every((p) => p.label === 0)).toBe(true);
	});

	it("refuses to return a short set", () => {
		expect(() =>
			crossPersonPairs([person("1", "A B")], new Map(), 5, 1),
		).toThrow(/produced \d+ of 5/);
	});
});
