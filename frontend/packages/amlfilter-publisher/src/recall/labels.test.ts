import { describe, expect, it } from "vitest";
import type { SourceLine } from "../sources/source.ts";
import { buildLabelledQueries, type LabelledQuery } from "./labels.ts";

function line(
	id: string,
	primary: string,
	aliases: readonly string[] = [],
): SourceLine {
	return {
		entity_id: id,
		primary_name: primary,
		entity_type: "PERSON",
		aliases: aliases.map((name) => ({ name })),
		dob: [],
		countries: [],
		risk_category: "SANCTION",
		source_list: "OFAC_SDN",
		list_version: "v1",
	};
}

function queryFor(
	queries: readonly LabelledQuery[],
	canonical: string,
): LabelledQuery {
	const found = queries.find((q) => q.canonical === canonical);
	if (found === undefined) {
		throw new Error(
			`no query for "${canonical}" in [${queries.map((q) => q.canonical).join(", ")}]`,
		);
	}
	return found;
}

describe("buildLabelledQueries", () => {
	it("labels each alias with the entity that published it", () => {
		const set = buildLabelledQueries([
			line("E1", "Ayman al-Zawahiri", ["Aiman Muhammad Rabi al-Zawahiri"]),
		]);
		const alias = queryFor(set.alias, "aiman muhammad rabi al-zawahiri");
		expect(alias.expected).toEqual(new Set(["E1"]));
		expect(alias.kind).toBe("alias");
		expect(alias.query).toBe("Aiman Muhammad Rabi al-Zawahiri");
	});

	it("labels each entity's own primary name in the canonical segment", () => {
		const set = buildLabelledQueries([line("E1", "Ayman al-Zawahiri")]);
		expect(set.canonical).toHaveLength(1);
		expect(queryFor(set.canonical, "ayman al-zawahiri").expected).toEqual(
			new Set(["E1"]),
		);
		expect(set.alias).toHaveLength(0);
	});

	it("accepts EVERY entity that publishes a shared name, not just one", () => {
		// Two designations really do share a name; scoring against one arbitrary
		// owner would report a miss for a correct answer.
		const set = buildLabelledQueries([
			line("E1", "Mohammed Ali"),
			line("E2", "Mohammed Ali"),
		]);
		expect(queryFor(set.canonical, "mohammed ali").expected).toEqual(
			new Set(["E1", "E2"]),
		);
	});

	it("accepts the alias owner AND an entity whose primary name is that string", () => {
		const set = buildLabelledQueries([
			line("E1", "Hassan Nasrallah", ["Hasan Nasrallah"]),
			line("E2", "Hasan Nasrallah"),
		]);
		expect(queryFor(set.alias, "hasan nasrallah").expected).toEqual(
			new Set(["E1", "E2"]),
		);
	});

	it("drops an alias that canonicalizes to its own entity's primary name", () => {
		// "Dr. Ayman  al-Zawahiri" canonicalizes to the primary name, so it tests
		// exact lookup, not the spelling-variant promise.
		const set = buildLabelledQueries([
			line("E1", "Ayman al-Zawahiri", ["Dr. Ayman  al-Zawahiri"]),
		]);
		expect(set.alias).toHaveLength(0);
	});

	it("drops an alias that canonicalizes to nothing", () => {
		const set = buildLabelledQueries([line("E1", "Real Name", ["!!!", "  "])]);
		expect(set.alias).toHaveLength(0);
	});

	it("de-duplicates queries that canonicalize identically", () => {
		const set = buildLabelledQueries([
			line("E1", "Target One", ["Al Fulan", "AL FULAN", "al  fulan"]),
		]);
		expect(set.alias).toHaveLength(1);
	});

	it("skips an entity whose primary name canonicalizes to nothing", () => {
		const set = buildLabelledQueries([line("E1", "***")]);
		expect(set.canonical).toHaveLength(0);
	});

	it("is deterministic — the same feed yields the same query order", () => {
		const feed = [
			line("E1", "Alpha One", ["A One"]),
			line("E2", "Beta Two", ["B Two"]),
		];
		const first = buildLabelledQueries(feed);
		const second = buildLabelledQueries(feed);
		expect(second.alias.map((q) => q.canonical)).toEqual(
			first.alias.map((q) => q.canonical),
		);
		expect(second.canonical.map((q) => q.canonical)).toEqual(
			first.canonical.map((q) => q.canonical),
		);
	});
});
