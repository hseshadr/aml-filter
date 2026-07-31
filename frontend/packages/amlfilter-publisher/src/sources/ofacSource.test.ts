// ofacSource.parse against the real CSL fixture — the adapter's end of the
// contract. The row-level parsing rules live in csl.test.ts; this file pins the
// things the BUNDLE depends on: the list identity, the namespaced entity_id,
// and that only OFAC SDN designations reach the published list.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { CSL_FILE, ofacSource } from "./ofacSource.ts";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURE = resolve(HERE, "../../fixtures/sources/csl_consolidated.csv");

async function rawBytes(): Promise<Record<string, string>> {
	return { [CSL_FILE]: await readFile(FIXTURE, "utf8") };
}

describe("ofacSource.parse against a real CSL fixture", () => {
	test("identity: id, title", () => {
		expect(ofacSource.id).toBe("OFAC_SDN");
		expect(ofacSource.title).toBe("OFAC SDN");
	});

	test("stamps a namespaced entity_id (OFAC_SDN:<entity_number>)", async () => {
		const lines = ofacSource.parse(await rawBytes(), "2026-07-30");
		expect(lines.map((l) => l.entity_id)).toEqual([
			"OFAC_SDN:36",
			"OFAC_SDN:6366",
			"OFAC_SDN:2677",
			"OFAC_SDN:7835",
			"OFAC_SDN:4238",
			"OFAC_SDN:7006",
		]);
	});

	test("publishes ONLY OFAC SDN designations", async () => {
		const lines = ofacSource.parse(await rawBytes(), "2026-07-30");
		// The Treasury SSI row in the fixture must not leak into OFAC_SDN.
		expect(lines).toHaveLength(6);
		for (const line of lines) {
			expect(line.source_list).toBe("OFAC_SDN");
			expect(line.risk_category).toBe("SANCTION");
		}
	});

	test("carries names, aliases, dob and ISO-2 countries through", async () => {
		const byId = new Map(
			ofacSource
				.parse(await rawBytes(), "2026-07-30")
				.map((l) => [l.entity_id, l]),
		);
		const person = byId.get("OFAC_SDN:7835");
		expect(person?.primary_name).toBe("JARRAYA, Khalil");
		expect(person?.entity_type).toBe("PERSON");
		expect(person?.dob).toEqual(["1969-02-08", "1970-08-15"]);
		expect(person?.countries).toEqual(["TN", "BA"]);
		expect(person?.aliases.length).toBeGreaterThan(3);
	});

	test("stamps the run's list_version on every record", async () => {
		const lines = ofacSource.parse(await rawBytes(), "2026-07-30");
		for (const line of lines) {
			expect(line.list_version).toBe("2026-07-30");
		}
	});
});
