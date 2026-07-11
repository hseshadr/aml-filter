// fetchOfacJsonl drives the live-fetch path against a stubbed fetch: pull
// SDN.CSV + ALT.CSV, parse them (skipping sentinel/short rows), and emit one
// JSON line per entity. Also pins parseSdn's skip rules for degenerate rows
// (name "-0-" sentinel, missing Remarks/type columns) and indexAliases' skip
// rules for short/sentinel ALT rows.

import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchOfacJsonl, parseSdn } from "./fetchOfac.ts";
import type { SourceLine } from "./sources/source.ts";

const SDN_CSV = [
	`123,"DOE, John",individual,PROGRAM,-0-,-0-,-0-,-0-,-0-,-0-,-0-,"DOB 01 Jan 1970; nationality Cuba; Passport 123"`,
	"456,-0-,-0-",
	"789,Acme Corp",
	"",
].join("\n");

const ALT_CSV = [
	`123,1,aka,"Johnny D",-0-`,
	"123,2,aka,-0-,-0-",
	"999",
	"",
].join("\n");

describe("parseSdn degenerate rows", () => {
	test("skips sentinel-name rows; a short row still yields an entity", () => {
		const lines = parseSdn(SDN_CSV, ALT_CSV, "v1");
		expect(lines.map((l) => l.entity_id)).toEqual([
			"OFAC_SDN:123",
			"OFAC_SDN:789",
		]);
		const [doe, acme] = lines;
		expect(doe?.primary_name).toBe("DOE, John");
		expect(doe?.entity_type).toBe("PERSON");
		expect(doe?.aliases).toEqual([{ name: "Johnny D" }]); // -0- and short ALT rows skipped
		expect(doe?.dob).toEqual(["01 Jan 1970"]);
		expect(doe?.countries).toEqual(["Cuba"]);
		// Row 789 has no type/remarks columns at all: safe defaults.
		expect(acme?.primary_name).toBe("Acme Corp");
		expect(acme?.entity_type).toBe("ORGANIZATION");
		expect(acme?.aliases).toEqual([]);
		expect(acme?.dob).toEqual([]);
		expect(acme?.countries).toEqual([]);
	});
});

describe("fetchOfacJsonl", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("fetches both files and returns one JSON line per entity", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request): Promise<Response> => {
				const url = String(input);
				return new Response(url.includes("SDN.CSV") ? SDN_CSV : ALT_CSV);
			}),
		);
		const jsonl = await fetchOfacJsonl("2026-07-11");
		const lines = jsonl
			.split("\n")
			.map((line) => JSON.parse(line) as SourceLine);
		expect(lines).toHaveLength(2);
		expect(lines[0]?.entity_id).toBe("OFAC_SDN:123");
		expect(lines[0]?.list_version).toBe("2026-07-11");
		expect(lines[1]?.entity_id).toBe("OFAC_SDN:789");
	});

	test("rejects with the failing URL and status on a non-OK response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async (): Promise<Response> =>
					new Response("nope", { status: 500, statusText: "Internal" }),
			),
		);
		await expect(fetchOfacJsonl("2026-07-11")).rejects.toThrow(
			"failed: 500 Internal",
		);
	});
});
