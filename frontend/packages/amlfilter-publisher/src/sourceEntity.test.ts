import { describe, expect, test } from "vitest";
import { toWatchlistEntity } from "./sourceEntity.ts";

// toWatchlistEntity must canonicalize the messy per-source DOB strings into the
// ISO prefix the scorer assumes (it does NOT re-parse at screen time). The first
// NON-NULL normalized value wins; an empty/unparseable list yields null.

/** Build a minimal valid source record with the given raw DOBs. */
function srcWithDob(dob: readonly string[]): Record<string, unknown> {
	return {
		entity_id: "OFAC_SDN:1",
		primary_name: "Jon Q. Fakename",
		risk_category: "SANCTIONS",
		source_list: "OFAC_SDN",
		list_version: "test-1",
		dob,
	};
}

describe("toWatchlistEntity normalizes the wire DOB to an ISO prefix", () => {
	test("OFAC '10 Dec 1948' -> '1948-12-10'", () => {
		const wire = toWatchlistEntity(srcWithDob(["10 Dec 1948"]), 1);
		expect(wire.dob).toBe("1948-12-10");
	});

	test("UK '12/04/1980' -> '1980-04-12'", () => {
		const wire = toWatchlistEntity(srcWithDob(["12/04/1980"]), 1);
		expect(wire.dob).toBe("1980-04-12");
	});

	test("'circa 1955' -> '1955'", () => {
		const wire = toWatchlistEntity(srcWithDob(["circa 1955"]), 1);
		expect(wire.dob).toBe("1955");
	});

	test("an empty DOB list -> null", () => {
		const wire = toWatchlistEntity(srcWithDob([]), 1);
		expect(wire.dob).toBeNull();
	});

	test("a single unparseable DOB -> null", () => {
		const wire = toWatchlistEntity(srcWithDob(["not a date"]), 1);
		expect(wire.dob).toBeNull();
	});

	test("an already-ISO DOB passes through unchanged", () => {
		const wire = toWatchlistEntity(srcWithDob(["1937-04-28"]), 1);
		expect(wire.dob).toBe("1937-04-28");
	});

	test("the first NON-NULL normalized value wins over a leading unparseable one", () => {
		const wire = toWatchlistEntity(
			srcWithDob(["not a date", "10 Dec 1948"]),
			1,
		);
		expect(wire.dob).toBe("1948-12-10");
	});
});
