import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ofacSource } from "./ofacSource.ts";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES = resolve(HERE, "../../fixtures/sources");

async function rawBytes(): Promise<Record<string, string>> {
	const [sdn, alt] = await Promise.all([
		readFile(resolve(FIXTURES, "ofac_sdn.csv"), "utf8"),
		readFile(resolve(FIXTURES, "ofac_alt.csv"), "utf8"),
	]);
	return { "SDN.CSV": sdn, "ALT.CSV": alt };
}

describe("ofacSource.parse against a real SDN.CSV/ALT.CSV fixture", () => {
	test("identity: id, title", () => {
		expect(ofacSource.id).toBe("OFAC_SDN");
		expect(ofacSource.title).toBe("OFAC SDN");
	});

	test("stamps a namespaced entity_id (OFAC_SDN:<rawId>, not OFAC-<id>)", async () => {
		const lines = ofacSource.parse(await rawBytes(), "2026-05-01");
		expect(lines.map((l) => l.entity_id)).toEqual([
			"OFAC_SDN:12345",
			"OFAC_SDN:67890",
			"OFAC_SDN:2674",
		]);
	});

	test("maps name, type, and joins ALT.CSV aliases by ent_num", async () => {
		const lines = ofacSource.parse(await rawBytes(), "2026-05-01");
		const ivan = lines[0];
		expect(ivan?.primary_name).toBe("FAKENAME, Ivan");
		expect(ivan?.entity_type).toBe("PERSON");
		expect(ivan?.aliases.map((a) => a.name)).toEqual([
			"FAKOVICH, Vanya",
			"FAKENAME, Vanya",
		]);
		const bank = lines[1];
		expect(bank?.entity_type).toBe("ORGANIZATION");
		expect(bank?.aliases.map((a) => a.name)).toEqual(["MIB"]);
	});

	test("extracts DOB and country from the person row's Remarks", async () => {
		const lines = ofacSource.parse(await rawBytes(), "2026-05-01");
		const ivan = lines[0];
		expect(ivan?.dob).toEqual(["14 Mar 1971"]);
		expect(ivan?.countries).toEqual(["Russia"]);
		// The org row has an empty Remarks -> no DOB/country.
		const bank = lines[1];
		expect(bank?.dob).toEqual([]);
		expect(bank?.countries).toEqual([]);
	});

	// Real OFAC primary names are "LASTNAME, Firstname" (a comma inside a quoted
	// field) and Remarks can carry an embedded, doubled-quoted '","' fragment. A
	// splitter that is not RFC-4180-aware shifts every column right (name becomes
	// "individual") and/or shatters Remarks, dropping DOB/country. This row proves
	// the quoted-comma name and the embedded '","' Remarks both survive parsing.
	test("parses a quoted-comma name and an embedded-quote Remarks (RFC-4180)", async () => {
		const lines = ofacSource.parse(await rawBytes(), "2026-05-01");
		const abbas = lines[2];
		expect(abbas?.primary_name).toBe("ABBAS, Abu Firstname");
		expect(abbas?.entity_type).toBe("PERSON");
		expect(abbas?.dob).toEqual(["12 Mar 1955"]);
		expect(abbas?.countries).toEqual(["Cuba"]);
	});

	test("stamps source_list, risk_category and the passed list_version", async () => {
		const lines = ofacSource.parse(await rawBytes(), "2026-05-01");
		for (const l of lines) {
			expect(l.source_list).toBe("OFAC_SDN");
			expect(l.risk_category).toBe("SANCTION");
			expect(l.list_version).toBe("2026-05-01");
		}
	});
});
