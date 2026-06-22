import { describe, expect, it } from "vitest";
import { normalizeDob } from "./normalize";

// normalizeDob canonicalizes the inconsistent date-of-birth strings the four
// sanctions sources (OFAC SDN, UN, EU, UK/OFSI) emit into an ISO prefix
// (YYYY, YYYY-MM, or YYYY-MM-DD) so the engine's dob_match — which compares
// strings and slices the first 4 chars for the year — works across sources.
describe("normalizeDob canonicalizes source DOB strings to an ISO prefix", () => {
	it("passes through full ISO dates unchanged", () => {
		expect(normalizeDob("1937-04-28")).toBe("1937-04-28");
	});

	it("passes through bare ISO years unchanged", () => {
		expect(normalizeDob("1971")).toBe("1971");
	});

	it("passes through ISO year-month unchanged", () => {
		expect(normalizeDob("1948-12")).toBe("1948-12");
	});

	it("parses day month-name year (OFAC/UN, 3-letter month)", () => {
		expect(normalizeDob("10 Dec 1948")).toBe("1948-12-10");
	});

	it("zero-pads single-digit days from day month-name year", () => {
		expect(normalizeDob("14 Mar 1971")).toBe("1971-03-14");
	});

	it("parses month-name year with no day to year-month", () => {
		expect(normalizeDob("Dec 1948")).toBe("1948-12");
	});

	it("accepts full month names case-insensitively", () => {
		expect(normalizeDob("10 december 1948")).toBe("1948-12-10");
	});

	it("parses dd/mm/yyyy day-first (UK OFSI), NOT mm/dd", () => {
		expect(normalizeDob("12/04/1980")).toBe("1980-04-12");
	});

	it("parses dd-mm-yyyy day-first", () => {
		expect(normalizeDob("12-04-1980")).toBe("1980-04-12");
	});

	it("passes through a bare year", () => {
		expect(normalizeDob("1960")).toBe("1960");
	});

	it("strips a 'circa' qualifier", () => {
		expect(normalizeDob("circa 1955")).toBe("1955");
	});

	it("strips a 'c.' qualifier", () => {
		expect(normalizeDob("c. 1955")).toBe("1955");
	});

	it("strips an 'approximately' qualifier", () => {
		expect(normalizeDob("approximately 1960")).toBe("1960");
	});

	it("takes the first year from a 'to' range", () => {
		expect(normalizeDob("1955 to 1959")).toBe("1955");
	});

	it("takes the first year from a hyphen year range", () => {
		expect(normalizeDob("1960-1962")).toBe("1960");
	});

	it("returns null for an empty string", () => {
		expect(normalizeDob("")).toBeNull();
	});

	it("returns null for the -0- sentinel", () => {
		expect(normalizeDob("-0-")).toBeNull();
	});

	it("returns null for unparseable input", () => {
		expect(normalizeDob("not a date")).toBeNull();
	});

	it("returns null for an out-of-range month", () => {
		expect(normalizeDob("1980-13-01")).toBeNull();
	});

	it("returns null for an out-of-range day in dd/mm/yyyy", () => {
		expect(normalizeDob("32/04/1980")).toBeNull();
	});

	it("returns null for an implausible year", () => {
		expect(normalizeDob("1700")).toBeNull();
	});
});
