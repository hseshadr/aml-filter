import { describe, expect, test } from "vitest";
import { parseRemarks, parseSdn, splitCsvLine } from "./fetchOfac.ts";

// Two synthetic OFAC rows in the real fixed-position CSV shape (12 SDN fields,
// 5 ALT fields, "-0-" sentinel). Asserts the id/name/type/alias mapping that
// fetchOfac does FOR REAL, plus the DOB/country now extracted from `Remarks`.
const SDN = [
	'"36","AEROCARIBBEAN AIRLINES","-0- ","CUBA","-0-","-0-","-0-","-0-","-0-","-0-","-0-","-0-"',
	'"7157","AL-NUR, Abdul","individual","SDGT","-0-","-0-","-0-","-0-","-0-","-0-","-0-","DOB 01 Jan 1960; nationality Yemen"',
].join("\n");

const ALT = [
	'"36","220","aka","AERO-CARIBBEAN","-0-"',
	'"7157","999","aka","Abdul AL NUR","-0-"',
].join("\n");

describe("splitCsvLine", () => {
	test("honors RFC-4180 quoting: commas inside quotes and doubled-quote escapes", () => {
		expect(splitCsvLine('"a, b","c","he said ""hi"""')).toEqual([
			"a, b",
			"c",
			'he said "hi"',
		]);
	});

	test("keeps a field whole when it contains an embedded quote-comma-quote fragment", () => {
		// A name with a comma + Remarks carrying a doubled-quoted '","' must NOT
		// shift columns. A naive ","-split would shatter this into extra fields.
		expect(
			splitCsvLine(
				'"2674","ABBAS, Abu","individual","DOB 1955; aka ""SMITH"",""JONES"""',
			),
		).toEqual([
			"2674",
			"ABBAS, Abu",
			"individual",
			'DOB 1955; aka "SMITH","JONES"',
		]);
	});

	test("maps the -0- sentinel to an empty string", () => {
		expect(splitCsvLine('"7","NAME","-0-"')).toEqual(["7", "NAME", ""]);
	});
});

describe("parseSdn", () => {
	test("maps id, name, type and joins aliases by ent_num", () => {
		const lines = parseSdn(SDN, ALT, "2026-06-19");
		expect(lines).toHaveLength(2);

		const org = lines[0];
		expect(org?.entity_id).toBe("OFAC_SDN:36");
		expect(org?.primary_name).toBe("AEROCARIBBEAN AIRLINES");
		expect(org?.entity_type).toBe("ORGANIZATION");
		expect(org?.aliases).toEqual([{ name: "AERO-CARIBBEAN" }]);
		expect(org?.source_list).toBe("OFAC_SDN");
		expect(org?.list_version).toBe("2026-06-19");

		const person = lines[1];
		expect(person?.entity_type).toBe("PERSON");
		expect(person?.aliases).toEqual([{ name: "Abdul AL NUR" }]);
	});

	test("extracts DOB and country from a row's Remarks field", () => {
		const [org, person] = parseSdn(SDN, ALT, "2026-06-19");
		// The org row has an empty ("-0-") Remarks -> no DOB/country.
		expect(org?.dob).toEqual([]);
		expect(org?.countries).toEqual([]);
		// The person row's Remarks is "DOB 01 Jan 1960; nationality Yemen".
		expect(person?.dob).toEqual(["01 Jan 1960"]);
		expect(person?.countries).toEqual(["Yemen"]);
	});
});

describe("parseRemarks", () => {
	test("extracts DOB and nationality from the common segment shape", () => {
		expect(
			parseRemarks("DOB 14 Mar 1971; nationality Russia; Gender Male"),
		).toEqual({ dob: ["14 Mar 1971"], countries: ["Russia"] });
	});

	test("collects multiple DOB segments, de-duplicated and order-preserved", () => {
		expect(
			parseRemarks("DOB 14 Mar 1971; DOB 15 Mar 1971; DOB 14 Mar 1971"),
		).toEqual({ dob: ["14 Mar 1971", "15 Mar 1971"], countries: [] });
	});

	test("reads country from a Citizen segment as well as nationality", () => {
		expect(parseRemarks("DOB 1960; Citizen Iran")).toEqual({
			dob: ["1960"],
			countries: ["Iran"],
		});
	});

	test("collects and de-duplicates nationality and Citizen countries", () => {
		expect(
			parseRemarks("nationality Russia; Citizen Russia; Citizen Iran"),
		).toEqual({ dob: [], countries: ["Russia", "Iran"] });
	});

	test("handles a bare year and a circa DOB", () => {
		expect(parseRemarks("DOB circa 1955")).toEqual({
			dob: ["circa 1955"],
			countries: [],
		});
		expect(parseRemarks("DOB 1960")).toEqual({ dob: ["1960"], countries: [] });
	});

	test("ignores unrecognized segments (Gender, Passport, ...)", () => {
		expect(
			parseRemarks("Gender Male; Passport 1234567 (Russia); Title Minister"),
		).toEqual({ dob: [], countries: [] });
	});

	test("tolerates empty / absent Remarks", () => {
		expect(parseRemarks("")).toEqual({ dob: [], countries: [] });
		expect(parseRemarks("   ")).toEqual({ dob: [], countries: [] });
	});
});
