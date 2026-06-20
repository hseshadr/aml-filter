import type { Match } from "@amlfilter/browser";
import { describe, expect, it } from "vitest";
import { materialFingerprint } from "./fingerprint";
import { type CustomerProfile, tierMatch } from "./tier_match";

function makeMatch(overrides: Partial<Match> = {}): Match {
	return {
		entity_id: "DEMO_SDN:0001",
		score: 0.9,
		entity_type: "PERSON",
		risk_category: "SANCTION",
		source_list: "DEMO_SDN",
		list_version: "demo-v1",
		primary_name: "Ivan Fakovich",
		aliases: ["Vanya"],
		countries: ["RU"],
		nationalities: ["RU"],
		dob: ["1971-03-14"],
		addresses: [],
		identifiers: { passport: [], national_id: [], other: {} },
		reasons: [],
		explanation: "strong name match",
		...overrides,
	};
}

const profile: CustomerProfile = {
	name_canonical: "ivan fakovich",
	country: "RU",
};

describe("tierMatch", () => {
	it("tiers the score and denormalizes the entity fields", () => {
		const tiered = tierMatch(makeMatch({ score: 0.95 }), profile, 0.65);
		expect(tiered.ofac_entity_id).toBe("DEMO_SDN:0001");
		expect(tiered.score).toBe(0.95);
		expect(tiered.tier).toBe("STRONG");
		expect(tiered.sanctioned_name).toBe("Ivan Fakovich");
		expect(tiered.source_list).toBe("DEMO_SDN");
	});

	it("computes the material fingerprint from the profile + entity halves", () => {
		const match = makeMatch();
		const tiered = tierMatch(match, profile, 0.65);
		expect(tiered.material_fingerprint).toBe(
			materialFingerprint(profile, {
				name_canonical: match.primary_name,
				aliases: match.aliases,
				dob: match.dob,
				countries: match.countries,
			}),
		);
	});

	it("changes the fingerprint when the entity aliases change", () => {
		const a = tierMatch(makeMatch({ aliases: ["Vanya"] }), profile, 0.65);
		const b = tierMatch(makeMatch({ aliases: ["Different"] }), profile, 0.65);
		expect(b.material_fingerprint).not.toBe(a.material_fingerprint);
	});
});
