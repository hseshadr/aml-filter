// ukSource edge behavior: header discovery failure (no `Group ID` marker line),
// groups without a "Primary name" row (first-row fallback), rows shorter than
// the header, columns absent from the header entirely, quoted fields with
// embedded commas/escaped quotes, and fetchRaw against a stubbed fetch.

import { afterEach, describe, expect, test, vi } from "vitest";
import { UK_RAW_FILE, ukSource } from "./ukSource.ts";

const EDGE_CSV = [
	"Last Updated,01/07/2026",
	"Group ID,Name 1,Name 6,Group Type,Alias Type,DOB,Nationality",
	"1,John,Doe,Individual,Primary name,01/01/1970,Iran",
	`1,"Smith, ""JJ""",X,Individual,AKA,,`,
	"1,,,Individual,AKA,,",
	"2,Acme,,Entity,AKA,,",
	"3,OnlyName",
	"",
].join("\n");

function parse(csv: string) {
	return ukSource.parse({ [UK_RAW_FILE]: csv }, "v1");
}

describe("ukSource.parse edge cases", () => {
	test("groups by Group ID: primary row wins, blank-name AKA rows are dropped", () => {
		const [john] = parse(EDGE_CSV);
		expect(john?.entity_id).toBe("UK_OFSI:1");
		expect(john?.primary_name).toBe("John Doe");
		expect(john?.entity_type).toBe("PERSON");
		// The quoted alias keeps its embedded comma + escaped quotes; the
		// all-blank alias row folds to "" and is filtered out.
		expect(john?.aliases).toEqual([{ name: `Smith, "JJ" X` }]);
		expect(john?.dob).toEqual(["01/01/1970"]);
		expect(john?.countries).toEqual(["Iran"]);
	});

	test("a group with no Primary name row falls back to its first row", () => {
		const [, acme] = parse(EDGE_CSV);
		expect(acme?.entity_id).toBe("UK_OFSI:2");
		expect(acme?.primary_name).toBe("Acme");
		expect(acme?.entity_type).toBe("ORGANIZATION");
		expect(acme?.aliases).toEqual([{ name: "Acme" }]); // its own AKA row
		expect(acme?.dob).toEqual([]);
		expect(acme?.countries).toEqual([]);
	});

	test("a row shorter than the header backfills missing columns as empty", () => {
		const [, , short] = parse(EDGE_CSV);
		expect(short?.entity_id).toBe("UK_OFSI:3");
		expect(short?.primary_name).toBe("OnlyName");
		expect(short?.entity_type).toBe("ORGANIZATION");
		expect(short?.dob).toEqual([]);
	});

	test("a CSV without the Group ID header parses to an empty list", () => {
		expect(parse("Last Updated,01/07/2026\nsome,other,line\n")).toEqual([]);
	});

	test("a raw map missing the file parses to an empty list", () => {
		expect(ukSource.parse({}, "v1")).toEqual([]);
	});
});

describe("ukSource.fetchRaw", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("returns the CSV keyed by the logical file name", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (): Promise<Response> => new Response("csv-bytes")),
		);
		await expect(ukSource.fetchRaw()).resolves.toEqual({
			[UK_RAW_FILE]: "csv-bytes",
		});
	});

	test("extracts the upstream day/month/year update date unambiguously", () => {
		expect(
			ukSource.sourceUpdatedAt?.({
				[UK_RAW_FILE]: "Last Updated,01/07/2026\nheader\n",
			}),
		).toBe("2026-07-01T00:00:00.000Z");
	});

	test("rejects with the status on a non-OK response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async (): Promise<Response> =>
					new Response("nope", { status: 404, statusText: "Not Found" }),
			),
		);
		// Raised by the shared fetch seam now; assert the STATUS, not the prose
		// (a 404 is permanent, so the seam does not spend retries on it).
		await expect(ukSource.fetchRaw()).rejects.toThrow("failed: 404 Not Found");
	});
});
