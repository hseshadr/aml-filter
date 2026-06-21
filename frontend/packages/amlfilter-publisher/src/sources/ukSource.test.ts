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

describe("ukSource.parse against a real-format UK OFSI ConList CSV fixture", () => {
	test("identity", () => {
		expect(ukSource.id).toBe("UK_OFSI");
		expect(ukSource.title).toBe("UK OFSI");
	});

	test("skips the leading 'Last Updated' metadata line and reads the header from line 2", async () => {
		// The real ConList.csv opens with `Last Updated,<date>` before the header.
		// If that line were mistaken for the header, every column would mis-map and
		// the leading metadata row would surface as a bogus entity. Assert neither
		// happens: exactly the three real Group IDs are reconstructed.
		const lines = ukSource.parse(await rawBytes(), "2026-05-01");
		expect(lines.map((l) => l.entity_id)).toEqual([
			"UK_OFSI:1001",
			"UK_OFSI:1002",
			"UK_OFSI:1003",
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

	test("entity group -> ORGANIZATION (org name in Name 6) with alias", async () => {
		const lines = ukSource.parse(await rawBytes(), "2026-05-01");
		const org = lines[1];
		expect(org?.primary_name).toBe("Imaginary Logistics Ltd");
		expect(org?.entity_type).toBe("ORGANIZATION");
		expect(org?.aliases.map((a) => a.name)).toEqual(["ImagLog"]);
	});

	test("RFC-4180 doubled-quote escape parses to a literal double quote", async () => {
		// Real feed: `"""ACME"" TRADING LLC"` -> `"ACME" TRADING LLC`.
		const lines = ukSource.parse(await rawBytes(), "2026-05-01");
		const escaped = lines[2];
		expect(escaped?.entity_id).toBe("UK_OFSI:1003");
		expect(escaped?.primary_name).toBe('"ACME" TRADING LLC');
		expect(escaped?.entity_type).toBe("ORGANIZATION");
	});

	test("an embedded comma inside a quoted field stays intact (not a column split)", async () => {
		// `"1 Imaginary Street, Flat 2"` is the individual's Address 1; the comma
		// inside it must not shift the later Group Type / Alias Type / Group ID
		// columns. We assert the downstream columns parsed correctly: the row is
		// still an Individual primary name under Group 1001 with its DOB intact.
		const [person] = ukSource.parse(await rawBytes(), "2026-05-01");
		expect(person?.entity_id).toBe("UK_OFSI:1001");
		expect(person?.entity_type).toBe("PERSON");
		expect(person?.dob).toEqual(["12/04/1980"]);
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
