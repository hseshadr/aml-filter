import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { UK_RAW_FILE, ukSource } from "./ukSource.ts";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES = resolve(HERE, "../../fixtures/sources");

// Every data row in this fixture is cut verbatim from the real FCDO UK Sanctions
// List CSV (Report Date 21-Sep-2026), keeping the real 58-column header and the
// leading `Report Date:` metadata line. Designations kept, in feed order:
//   AQD0194  Individual, Asset freeze, OFSI Group ID 6995, `Primary name`
//   CYB0114  Entity, Asset freeze, `Primary Name` + quoted "Co., Ltd." names
//   DPR0076  Ship, De-flag|Prohibition of port entry (NO asset freeze)
//   DPR0104  Ship, Asset freeze
//   IRN0249  Individual, first two `Primary Name` rows have no name; two DOBs
//   RUS0078  Individual, blank Name-type row first, then `Primary name`
//   RUS1055  Individual, blank Name-type row first, then `Primary Name`
//   SOM0003  Individual, Asset freeze, ALSO OFSI Group ID 6995
async function rawBytes(): Promise<Record<string, string>> {
	const csv = await readFile(
		resolve(FIXTURES, "uk_sanctions_list.csv"),
		"utf8",
	);
	return { [UK_RAW_FILE]: csv };
}

async function parsed() {
	return ukSource.parse(await rawBytes(), "2026-09-21");
}

async function byId(uniqueId: string) {
	return (await parsed()).find((l) => l.entity_id === `UK_OFSI:${uniqueId}`);
}

describe("ukSource.parse against a real UK Sanctions List CSV fixture", () => {
	test("identity: list id is still UK_OFSI, title names the new source", () => {
		expect(ukSource.id).toBe("UK_OFSI");
		expect(ukSource.title).toBe("UK Sanctions List");
	});

	test("skips the Report Date line and keys entities on Unique ID (asset-freeze only)", async () => {
		const lines = await parsed();
		expect(lines.map((l) => l.entity_id)).toEqual([
			"UK_OFSI:AQD0194",
			"UK_OFSI:CYB0114",
			"UK_OFSI:DPR0104",
			"UK_OFSI:IRN0249",
			"UK_OFSI:RUS0078",
			"UK_OFSI:RUS1055",
			"UK_OFSI:SOM0003",
		]);
	});

	test("a designation without an asset freeze (a port-ban-only Ship) is excluded", async () => {
		expect(await byId("DPR0076")).toBeUndefined();
		expect(await parsed()).toHaveLength(7);
	});

	test("two designations sharing one OFSI Group ID stay two entities", async () => {
		const aqd = await byId("AQD0194");
		const som = await byId("SOM0003");
		expect(aqd?.primary_name).toBe("HASSAN DAHIR AWEYS");
		expect(som?.primary_name).toBe("HASSAN DAHIR AWEYS");
		expect(som?.aliases.map((a) => a.name)).toContain("Aweys Hassan DAHIR");
		expect(aqd?.aliases.map((a) => a.name)).not.toContain("Aweys Hassan DAHIR");
	});

	test("`Primary Name` (capital N) selects the primary row", async () => {
		const rus1055 = await byId("RUS1055");
		expect(rus1055?.primary_name).toBe("Aliaksandr Piatrovich VETSIANEVICH");
		expect(rus1055?.aliases).toEqual([
			{ name: "Alexander Petrovich Vetenevich" },
		]);
	});

	test("`Primary name` (lower n) selects the primary row", async () => {
		const rus0078 = await byId("RUS0078");
		expect(rus0078?.primary_name).toBe("Sergei Orestovoch Beseda");
		expect(rus0078?.aliases).toEqual([{ name: "Sergey Beseda" }]);
	});

	test("a primary row without a name is skipped for the next named primary row", async () => {
		const irn = await byId("IRN0249");
		expect(irn?.primary_name).toBe("Hossein SHAMKHANI");
		expect(irn?.aliases).toEqual([{ name: "Hector SHAMKHANI" }]);
	});

	test("every designation has a non-empty primary name", async () => {
		for (const l of await parsed()) {
			expect(l.primary_name).not.toBe("");
		}
	});

	test("repeated rows fold into distinct aliases (the feed repeats rows per DOB)", async () => {
		const aqd = await byId("AQD0194");
		const names = aqd?.aliases.map((a) => a.name) ?? [];
		expect(names).toHaveLength(12);
		expect(new Set(names).size).toBe(12);
		expect(names).not.toContain("HASSAN DAHIR AWEYS");
	});

	test("individual: D.O.B and Nationality(/ies) are mapped, all distinct DOBs kept", async () => {
		const rus1055 = await byId("RUS1055");
		expect(rus1055?.entity_type).toBe("PERSON");
		expect(rus1055?.dob).toEqual(["20/06/1976"]);
		expect(rus1055?.countries).toEqual(["Belarus"]);
		const irn = await byId("IRN0249");
		expect(irn?.dob).toEqual(["dd/mm/1984", "dd/mm/1985"]);
		expect(irn?.countries).toEqual(["Iran"]);
	});

	test("Ship and Entity designations -> ORGANIZATION", async () => {
		expect((await byId("DPR0104"))?.entity_type).toBe("ORGANIZATION");
		expect((await byId("DPR0104"))?.primary_name).toBe("Ji Song 6");
		const cyb = await byId("CYB0114");
		expect(cyb?.entity_type).toBe("ORGANIZATION");
		expect(cyb?.dob).toEqual([]);
		expect(cyb?.countries).toEqual([]);
	});

	test("a comma inside a quoted real name field stays intact", async () => {
		const cyb = await byId("CYB0114");
		expect(cyb?.primary_name).toBe(
			"Sichuan Anxun Information Technology Co., Ltd.",
		);
		expect(cyb?.aliases).toEqual([
			{ name: "Anxun Information Technology Co., Ltd." },
			{ name: "i-Soon" },
		]);
	});

	test("stamps source_list, risk_category, list_version", async () => {
		for (const l of await parsed()) {
			expect(l.source_list).toBe("UK_OFSI");
			expect(l.risk_category).toBe("SANCTION");
			expect(l.list_version).toBe("2026-09-21");
		}
	});

	test("sourceUpdatedAt reads the fixture's Report Date line", async () => {
		expect(ukSource.sourceUpdatedAt?.(await rawBytes())).toBe(
			"2026-09-21T00:00:00.000Z",
		);
	});
});
