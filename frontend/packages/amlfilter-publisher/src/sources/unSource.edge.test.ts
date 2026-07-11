// unSource edge behavior: the YEAR fallback for a DOB, individuals with no
// DATAID/DOB at all, NATIONALITY nodes without a VALUE, alias nodes without an
// ALIAS_NAME, ENTITY (organization) mapping, and fetchRaw against a stubbed
// fetch (keyed file + non-OK failure).

import { afterEach, describe, expect, test, vi } from "vitest";
import { UN_RAW_FILE, unSource } from "./unSource.ts";

const EDGE_XML = [
	"<CONSOLIDATED_LIST>",
	"<INDIVIDUAL>",
	"<DATAID>7</DATAID>",
	"<FIRST_NAME>Ann</FIRST_NAME>",
	"<INDIVIDUAL_DATE_OF_BIRTH><YEAR>1955</YEAR></INDIVIDUAL_DATE_OF_BIRTH>",
	"<NATIONALITY><VALUE>France</VALUE></NATIONALITY>",
	"<NATIONALITY></NATIONALITY>",
	"<INDIVIDUAL_ALIAS></INDIVIDUAL_ALIAS>",
	"<INDIVIDUAL_ALIAS><ALIAS_NAME>A.</ALIAS_NAME></INDIVIDUAL_ALIAS>",
	"</INDIVIDUAL>",
	"<INDIVIDUAL>",
	"<FIRST_NAME>NoDob</FIRST_NAME>",
	"</INDIVIDUAL>",
	"<ENTITY>",
	"<DATAID>9</DATAID>",
	"<FIRST_NAME>Org Co</FIRST_NAME>",
	"<ENTITY_ALIAS><ALIAS_NAME>OC</ALIAS_NAME></ENTITY_ALIAS>",
	"</ENTITY>",
	"</CONSOLIDATED_LIST>",
].join("");

describe("unSource.parse edge cases", () => {
	test("YEAR-only DOBs, empty NATIONALITY/ALIAS nodes, missing DATAID", () => {
		const lines = unSource.parse({ [UN_RAW_FILE]: EDGE_XML }, "v1");
		expect(lines.map((l) => l.entity_id)).toEqual([
			"UN_CONSOLIDATED:7",
			"UN_CONSOLIDATED:",
			"UN_CONSOLIDATED:9",
		]);
		const [ann, noDob, org] = lines;
		expect(ann?.dob).toEqual(["1955"]); // DATE missing -> YEAR fallback
		expect(ann?.countries).toEqual(["France"]); // VALUE-less node dropped
		expect(ann?.aliases).toEqual([{ name: "A." }]); // nameless alias dropped
		expect(noDob?.primary_name).toBe("NoDob");
		expect(noDob?.dob).toEqual([]); // neither DATE nor YEAR
		expect(org?.entity_type).toBe("ORGANIZATION");
		expect(org?.dob).toEqual([]); // organizations never carry a DOB
		expect(org?.aliases).toEqual([{ name: "OC" }]);
	});

	test("a raw map missing the file parses to an empty list", () => {
		expect(unSource.parse({}, "v1")).toEqual([]);
	});
});

describe("unSource.fetchRaw", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("returns the XML keyed by the logical file name", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (): Promise<Response> => new Response("<x/>")),
		);
		await expect(unSource.fetchRaw()).resolves.toEqual({
			[UN_RAW_FILE]: "<x/>",
		});
	});

	test("rejects with the status on a non-OK response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async (): Promise<Response> =>
					new Response("nope", { status: 500, statusText: "Server Error" }),
			),
		);
		await expect(unSource.fetchRaw()).rejects.toThrow(
			"fetch UN list failed: 500 Server Error",
		);
	});
});
