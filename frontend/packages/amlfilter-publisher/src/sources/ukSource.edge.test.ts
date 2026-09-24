// ukSource edge behavior: header discovery failure (no `Unique ID` marker line),
// Name-type casing and ordering traps, groups without a primary row (first-row
// fallback), rows shorter than the header, quoted fields with embedded
// commas/escaped quotes, the `Report Date:` freshness line, the body size cap,
// and fetchRaw against a stubbed fetch.

import { afterEach, describe, expect, test, vi } from "vitest";
import { UK_RAW_FILE, UK_URL, ukSource } from "./ukSource.ts";

const HEADER =
	"Unique ID,OFSI Group ID,Name 1,Name 6,Name type,Designation Type,Sanctions Imposed,D.O.B,Nationality(/ies)";

const EDGE_CSV = [
	"Report Date: 01-Jul-2026",
	HEADER,
	"A1,9,John,Doe,Primary name,Individual,Asset freeze|Travel Ban,01/01/1970,Iran",
	`A1,9,"Smith, ""JJ""",X,Alias,Individual,Asset freeze|Travel Ban,,`,
	"A1,9,,,Alias,Individual,Asset freeze|Travel Ban,,",
	"B2,,Acme,,Alias,Entity,ASSET FREEZE,,",
	"C3,,Wrong,Variation,Primary Name Variation,Entity,Asset freeze,,",
	"C3,,Right,Primary,PRIMARY NAME ,Entity,Asset freeze,,",
	"D4,,Only,Ship,Primary name,Ship,Prohibition of port entry,,",
	"E5,,OnlyName",
	"",
].join("\n");

function parse(csv: string) {
	return ukSource.parse({ [UK_RAW_FILE]: csv }, "v1");
}

function byId(csv: string, uniqueId: string) {
	return parse(csv).find((l) => l.entity_id === `UK_OFSI:${uniqueId}`);
}

describe("ukSource.parse edge cases", () => {
	test("groups by Unique ID: primary row wins, blank-name alias rows are dropped", () => {
		const john = byId(EDGE_CSV, "A1");
		expect(john?.primary_name).toBe("John Doe");
		expect(john?.entity_type).toBe("PERSON");
		// The quoted alias keeps its embedded comma + escaped quotes; the
		// all-blank alias row folds to "" and is filtered out.
		expect(john?.aliases).toEqual([{ name: `Smith, "JJ" X` }]);
		expect(john?.dob).toEqual(["01/01/1970"]);
		expect(john?.countries).toEqual(["Iran"]);
	});

	test("a Primary Name Variation row listed first never becomes the primary name", () => {
		const c3 = byId(EDGE_CSV, "C3");
		expect(c3?.primary_name).toBe("Right Primary");
		expect(c3?.aliases).toEqual([{ name: "Wrong Variation" }]);
	});

	test("asset-freeze match is case-insensitive; a no-freeze designation is dropped", () => {
		expect(byId(EDGE_CSV, "B2")?.primary_name).toBe("Acme");
		expect(byId(EDGE_CSV, "D4")).toBeUndefined();
	});

	test("a group with no primary row falls back to its first row", () => {
		const acme = byId(EDGE_CSV, "B2");
		expect(acme?.entity_type).toBe("ORGANIZATION");
		expect(acme?.aliases).toEqual([]);
		expect(acme?.dob).toEqual([]);
		expect(acme?.countries).toEqual([]);
	});

	test("a row shorter than the header has no sanctions and is dropped", () => {
		expect(byId(EDGE_CSV, "E5")).toBeUndefined();
	});

	test("a CSV without the Unique ID header parses to an empty list", () => {
		expect(parse("Report Date: 01-Jul-2026\nsome,other,line\n")).toEqual([]);
	});

	test("a raw map missing the file parses to an empty list", () => {
		expect(ukSource.parse({}, "v1")).toEqual([]);
	});
});

describe("ukSource source identity", () => {
	test("fetches the FCDO UK Sanctions List CSV", () => {
		expect(UK_URL).toBe(
			"https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.csv",
		);
	});

	test("stores the raw CSV under uk_sanctions_list.csv", () => {
		expect(UK_RAW_FILE).toBe("uk_sanctions_list.csv");
	});
});

describe("ukSource freshness (Report Date line)", () => {
	function updatedAt(firstLine: string): string | undefined {
		return ukSource.sourceUpdatedAt?.({
			[UK_RAW_FILE]: `${firstLine}\n${HEADER}\n`,
		});
	}

	test("parses `Report Date: 21-Sep-2026` as UTC midnight", () => {
		expect(updatedAt("Report Date: 21-Sep-2026")).toBe(
			"2026-09-21T00:00:00.000Z",
		);
	});

	test("a missing Report Date line yields no timestamp", () => {
		expect(updatedAt("Last Updated,01/07/2026")).toBeUndefined();
	});

	test("rejects an impossible calendar date", () => {
		expect(() => updatedAt("Report Date: 31-Feb-2026")).toThrow(
			/UK_OFSI.*freshness timestamp.*invalid/i,
		);
	});

	test("rejects an unknown month abbreviation", () => {
		expect(() => updatedAt("Report Date: 21-Foo-2026")).toThrow(
			/UK_OFSI.*freshness timestamp.*invalid/i,
		);
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

	test("fetchSnapshot rejects an impossible upstream calendar date", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async (): Promise<Response> =>
					new Response(`Report Date: 31-Feb-2026\n${HEADER}\n`),
			),
		);

		await expect(ukSource.fetchSnapshot?.()).rejects.toThrow(
			/UK_OFSI.*freshness timestamp.*invalid/i,
		);
	});

	test("refuses a body over 128 MiB (134217728 bytes)", async () => {
		// The real CSV is ~50MB; the cap is set deliberately with headroom. Stream
		// 128 x 1 MiB + 1 byte so the cap trips exactly one byte past the limit.
		const mib = new Uint8Array(1024 * 1024);
		let sent = 0;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (sent < 128) {
					sent++;
					controller.enqueue(mib);
				} else {
					controller.enqueue(new Uint8Array(1));
					controller.close();
				}
			},
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async (): Promise<Response> => new Response(body)),
		);
		await expect(ukSource.fetchRaw()).rejects.toThrow(
			"exceeded 134217728 bytes",
		);
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
