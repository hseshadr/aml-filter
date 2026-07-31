// The CSL reader, proven against REAL rows lifted verbatim from
// data.trade.gov's consolidated.csv (fixtures/sources/csl_consolidated.csv):
// two OFAC entities (one alias / many aliases), two individuals (one with a
// comma inside the primary name, one with multi-valued DOB + nationality), a
// vessel, and one NON-OFAC row that must be filtered out.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { CSL_SDN_SOURCE, parseCslSdn, splitCsvLine } from "./csl.ts";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURE = resolve(HERE, "../../fixtures/sources/csl_consolidated.csv");

async function csv(): Promise<string> {
	return readFile(FIXTURE, "utf8");
}

describe("splitCsvLine", () => {
	test("keeps commas inside a quoted field with the field", () => {
		// CSL primary names are "LASTNAME, Firstname" — a naive split on ","
		// shifts every later column left and corrupts the whole record.
		expect(splitCsvLine('1,"AL-ZOMOR, Abboud",Individual')).toEqual([
			"1",
			"AL-ZOMOR, Abboud",
			"Individual",
		]);
	});

	test("unescapes a doubled quote", () => {
		expect(splitCsvLine('a,"say ""hi""",b')).toEqual(["a", 'say "hi"', "b"]);
	});
});

describe("parseCslSdn against real consolidated.csv rows", () => {
	// The negative row is deliberately a Treasury SSI entry (VTB Bank, 17013):
	// same agency, populated entity_number and name, so ONLY the `source` filter
	// can exclude it. An unpopulated row would let this test pass even with the
	// filter deleted — it would measure the shape of the fixture, not the guard.
	test("keeps ONLY the OFAC SDN rows — the population must not drift", async () => {
		const lines = parseCslSdn(await csv(), "2026-07-30");
		// 7 fixture rows, 6 of them SDN; the SSI row must not reach OFAC_SDN.
		expect(lines).toHaveLength(6);
		expect(lines.map((l) => l.entity_id)).not.toContain("OFAC_SDN:17013");
	});

	test("names the exact source it filters on", () => {
		expect(CSL_SDN_SOURCE).toBe(
			"Specially Designated Nationals (SDN) - Treasury Department",
		);
	});

	test("stamps the namespaced OFAC_SDN entity_id from entity_number", async () => {
		const lines = parseCslSdn(await csv(), "2026-07-30");
		expect(lines.map((l) => l.entity_id)).toEqual([
			"OFAC_SDN:36",
			"OFAC_SDN:6366",
			"OFAC_SDN:2677",
			"OFAC_SDN:7835",
			"OFAC_SDN:4238",
			"OFAC_SDN:7006",
		]);
	});

	test("maps Individual to PERSON and every other type to ORGANIZATION", async () => {
		const byId = new Map(
			parseCslSdn(await csv(), "2026-07-30").map((l) => [l.entity_id, l]),
		);
		expect(byId.get("OFAC_SDN:2677")?.entity_type).toBe("PERSON");
		expect(byId.get("OFAC_SDN:36")?.entity_type).toBe("ORGANIZATION");
		// A vessel is not a person.
		expect(byId.get("OFAC_SDN:4238")?.entity_type).toBe("ORGANIZATION");
	});

	test("keeps a comma-bearing primary name intact", async () => {
		const line = parseCslSdn(await csv(), "2026-07-30").find(
			(l) => l.entity_id === "OFAC_SDN:2677",
		);
		expect(line?.primary_name).toBe("AL-ZOMOR, Abboud Abdul Latif Hassan");
	});

	test("splits semicolon-delimited aliases", async () => {
		const line = parseCslSdn(await csv(), "2026-07-30").find(
			(l) => l.entity_id === "OFAC_SDN:36",
		);
		expect(line?.aliases).toEqual([{ name: "AERO-CARIBBEAN" }]);

		const many = parseCslSdn(await csv(), "2026-07-30").find(
			(l) => l.entity_id === "OFAC_SDN:6366",
		);
		expect(many?.aliases.length).toBeGreaterThan(10);
		expect(many?.aliases).toContainEqual({ name: "AL QAEDA" });
	});

	test("carries every date of birth CSL publishes", async () => {
		const line = parseCslSdn(await csv(), "2026-07-30").find(
			(l) => l.entity_id === "OFAC_SDN:7835",
		);
		expect(line?.dob).toEqual(["1969-02-08", "1970-08-15"]);
	});

	// The engine's countryMatch() does EXACT uppercase set membership and scores
	// 1.0 / setSize, and the UI asks the user for an "ISO2" "Country Code" — so
	// the codes CSL publishes are exactly the right value space, and the set
	// must stay DE-DUPLICATED or the country score is silently divided down.
	test("emits ISO-2 country codes, de-duplicated across citizenship+nationality", async () => {
		const lines = parseCslSdn(await csv(), "2026-07-30");
		const byId = new Map(lines.map((l) => [l.entity_id, l]));
		expect(byId.get("OFAC_SDN:2677")?.countries).toEqual(["EG"]);
		expect(byId.get("OFAC_SDN:7835")?.countries).toEqual(["TN", "BA"]);
		// ent 7006 (AWEYS, Hassan Dahir) publishes citizenship SO *and*
		// nationality SO. 600 real SDN records overlap this way; without the
		// union being de-duplicated each of them would score 1/2 instead of 1/1
		// on an exact country match.
		expect(byId.get("OFAC_SDN:7006")?.countries).toEqual(["SO"]);
		for (const line of lines) {
			expect(new Set(line.countries).size).toBe(line.countries.length);
			for (const c of line.countries) {
				expect(c).toMatch(/^[A-Z]{2}$/);
			}
		}
	});

	test("stamps risk_category, source_list and the run's list_version", async () => {
		const line = parseCslSdn(await csv(), "2026-07-30")[0];
		expect(line?.risk_category).toBe("SANCTION");
		expect(line?.source_list).toBe("OFAC_SDN");
		expect(line?.list_version).toBe("2026-07-30");
	});

	test("fails loudly when a column it depends on disappears", () => {
		// Silent column drift in a sanctions feed is how a list quietly empties.
		expect(() => parseCslSdn("source,name\nx,y\n", "2026-07-30")).toThrow(
			/entity_number/,
		);
	});

	test("rejects a payload that is not the CSL file at all", () => {
		expect(() => parseCslSdn("", "2026-07-30")).toThrow();
	});
});
