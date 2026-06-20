import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { UK_RAW_FILE, ukSource } from "./ukSource.ts";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES = resolve(HERE, "../../fixtures/sources");

async function rawBytes(): Promise<Record<string, string>> {
	const csv = await readFile(resolve(FIXTURES, "uk_ofsi.csv"), "utf8");
	return { [UK_RAW_FILE]: csv };
}

describe("ukSource.parse against a real UK OFSI ConList CSV fixture", () => {
	test("identity", () => {
		expect(ukSource.id).toBe("UK_OFSI");
		expect(ukSource.title).toBe("UK OFSI");
	});

	test("groups rows by Group ID into one entity each, namespaced id", async () => {
		const lines = ukSource.parse(await rawBytes(), "2026-05-01");
		expect(lines.map((l) => l.entity_id)).toEqual([
			"UK_OFSI:1001",
			"UK_OFSI:1002",
		]);
	});

	test("individual: primary-name row builds the name, AKA rows are aliases", async () => {
		const [person] = ukSource.parse(await rawBytes(), "2026-05-01");
		expect(person?.primary_name).toBe("Sergei Petrovich Notreal");
		expect(person?.entity_type).toBe("PERSON");
		expect(person?.aliases.map((a) => a.name)).toEqual(["Seryozha Notreal"]);
		expect(person?.dob).toEqual(["12/04/1980"]);
		expect(person?.countries).toEqual(["Russia"]);
	});

	test("entity group -> ORGANIZATION with alias", async () => {
		const lines = ukSource.parse(await rawBytes(), "2026-05-01");
		const org = lines[1];
		expect(org?.primary_name).toBe("Imaginary Logistics Ltd");
		expect(org?.entity_type).toBe("ORGANIZATION");
		expect(org?.aliases.map((a) => a.name)).toEqual(["ImagLog"]);
	});

	test("stamps source_list, risk_category, list_version", async () => {
		const lines = ukSource.parse(await rawBytes(), "2026-05-01");
		for (const l of lines) {
			expect(l.source_list).toBe("UK_OFSI");
			expect(l.risk_category).toBe("SANCTION");
			expect(l.list_version).toBe("2026-05-01");
		}
	});
});
