import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { EU_RAW_FILE, EU_URL, euSource } from "./euSource.ts";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES = resolve(HERE, "../../fixtures/sources");

async function rawBytes(): Promise<Record<string, string>> {
	const xml = await readFile(resolve(FIXTURES, "eu_consolidated.xml"), "utf8");
	return { [EU_RAW_FILE]: xml };
}

describe("euSource.parse against a real EU consolidated XML fixture", () => {
	test("identity", () => {
		expect(euSource.id).toBe("EU_CONSOLIDATED");
		expect(euSource.title).toBe("EU Consolidated");
	});

	test("namespaced entity_id from logicalId", async () => {
		const lines = euSource.parse(await rawBytes(), "2026-05-01");
		expect(lines.map((l) => l.entity_id)).toEqual([
			"EU_CONSOLIDATED:13",
			"EU_CONSOLIDATED:45",
		]);
	});

	test("person: first strong nameAlias is primary, rest are aliases", async () => {
		const [person] = euSource.parse(await rawBytes(), "2026-05-01");
		expect(person?.primary_name).toBe("Boris Vymyshlyenny");
		expect(person?.entity_type).toBe("PERSON");
		expect(person?.aliases.map((a) => a.name)).toEqual(["Borya Vymyshlyenny"]);
	});

	test("birthdate -> dob, citizenship/address -> sorted unique countries", async () => {
		const [person] = euSource.parse(await rawBytes(), "2026-05-01");
		expect(person?.dob).toEqual(["1972-06-15"]);
		expect(person?.countries).toEqual(["RU"]);
	});

	test("enterprise -> ORGANIZATION; address country captured", async () => {
		const lines = euSource.parse(await rawBytes(), "2026-05-01");
		const org = lines[1];
		expect(org?.primary_name).toBe("Phantom Trading OOO");
		expect(org?.entity_type).toBe("ORGANIZATION");
		expect(org?.countries).toEqual(["BY"]);
	});

	test("stamps source_list, risk_category, list_version", async () => {
		const lines = euSource.parse(await rawBytes(), "2026-05-01");
		for (const l of lines) {
			expect(l.source_list).toBe("EU_CONSOLIDATED");
			expect(l.risk_category).toBe("SANCTION");
			expect(l.list_version).toBe("2026-05-01");
		}
	});
});

describe("EU_URL download endpoint", () => {
	test("is an absolute EU webgate https URL with a non-empty token param", () => {
		const url = new URL(EU_URL);
		expect(url.protocol).toBe("https:");
		expect(url.host).toBe("webgate.ec.europa.eu");
		// Guard against silently shipping an empty list by dropping the token.
		expect(url.searchParams.get("token")).toBeTruthy();
	});
});
