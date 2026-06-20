import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { UN_RAW_FILE, unSource } from "./unSource.ts";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES = resolve(HERE, "../../fixtures/sources");

async function rawBytes(): Promise<Record<string, string>> {
	const xml = await readFile(resolve(FIXTURES, "un_consolidated.xml"), "utf8");
	return { [UN_RAW_FILE]: xml };
}

describe("unSource.parse against a real UN consolidated XML fixture", () => {
	test("identity", () => {
		expect(unSource.id).toBe("UN_CONSOLIDATED");
		expect(unSource.title).toBe("UN Consolidated");
	});

	test("namespaced entity_id from DATAID, individuals then entities", async () => {
		const lines = unSource.parse(await rawBytes(), "2026-05-01");
		expect(lines.map((l) => l.entity_id)).toEqual([
			"UN_CONSOLIDATED:6908000",
			"UN_CONSOLIDATED:6908100",
		]);
	});

	test("individual: joined name, alias, DOB, nationality", async () => {
		const [person] = unSource.parse(await rawBytes(), "2026-05-01");
		expect(person?.primary_name).toBe("Qasim Al-Fictiti");
		expect(person?.entity_type).toBe("PERSON");
		expect(person?.aliases.map((a) => a.name)).toEqual(["Abu Qasim"]);
		expect(person?.dob).toEqual(["1965-08-01"]);
		expect(person?.countries).toEqual(["Yemen"]);
	});

	test("entity node -> ORGANIZATION with alias", async () => {
		const lines = unSource.parse(await rawBytes(), "2026-05-01");
		const org = lines[1];
		expect(org?.primary_name).toBe("Invented Charity Foundation");
		expect(org?.entity_type).toBe("ORGANIZATION");
		expect(org?.aliases.map((a) => a.name)).toEqual(["ICF"]);
	});

	test("stamps source_list, risk_category, list_version", async () => {
		const lines = unSource.parse(await rawBytes(), "2026-05-01");
		for (const l of lines) {
			expect(l.source_list).toBe("UN_CONSOLIDATED");
			expect(l.risk_category).toBe("SANCTION");
			expect(l.list_version).toBe("2026-05-01");
		}
	});
});
