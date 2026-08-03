import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { SourceLine } from "../sources/source.ts";
import { decodeFixture, encodeFixture, sha256Hex } from "./fixture.ts";

const LINE: SourceLine = {
	entity_id: "OFAC_SDN:1",
	primary_name: "Ayman al-Zawahiri",
	entity_type: "PERSON",
	aliases: [{ name: "Aiman al-Zawahri" }],
	dob: ["1951-06-19"],
	countries: ["EG"],
	risk_category: "SANCTION",
	source_list: "OFAC_SDN",
	list_version: "recall-fixture",
};

function fixtureOf(...records: readonly unknown[]): Uint8Array {
	return gzipSync(
		Buffer.from(`${records.map((r) => JSON.stringify(r)).join("\n")}\n`),
	);
}

describe("encodeFixture / decodeFixture", () => {
	it("round-trips a feed line without losing a field", () => {
		expect(decodeFixture(encodeFixture([LINE]))).toEqual([LINE]);
	});

	it("is byte-stable for the same input", () => {
		expect(encodeFixture([LINE])).toEqual(encodeFixture([LINE]));
	});

	it("compresses — the point of storing text instead of vectors", () => {
		const many = Array.from({ length: 500 }, (_, i) => ({
			...LINE,
			entity_id: `OFAC_SDN:${i}`,
		}));
		expect(encodeFixture(many).length).toBeLessThan(
			JSON.stringify(many).length / 4,
		);
	});

	it("skips blank lines", () => {
		const bytes = gzipSync(Buffer.from(`${JSON.stringify(LINE)}\n\n  \n`));
		expect(decodeFixture(bytes)).toHaveLength(1);
	});

	it("normalizes missing optional fields to empty arrays", () => {
		const bytes = fixtureOf({
			entity_id: "OFAC_SDN:2",
			primary_name: "Org",
			entity_type: "ORGANIZATION",
			risk_category: "SANCTION",
			source_list: "OFAC_SDN",
			list_version: "v",
		});
		expect(decodeFixture(bytes)[0]).toMatchObject({
			aliases: [],
			dob: [],
			countries: [],
		});
	});

	it("drops an alias entry with no usable name", () => {
		const bytes = fixtureOf({ ...LINE, aliases: [{ name: 1 }, { nope: "x" }] });
		expect(decodeFixture(bytes)[0]?.aliases).toEqual([]);
	});

	it("drops a non-string element from dob/countries", () => {
		const bytes = fixtureOf({ ...LINE, dob: [1], countries: ["EG", 2] });
		expect(decodeFixture(bytes)[0]).toMatchObject({ dob: [], countries: [] });
	});

	// Fail closed: a fixture the gate cannot trust must stop the run, not silently
	// shrink the corpus and make recall look better than it is.
	it("REJECTS a record missing a required string field", () => {
		const bytes = fixtureOf({ primary_name: "no id" });
		expect(() => decodeFixture(bytes)).toThrow(/missing\/invalid string field/);
	});

	it("REJECTS an unknown entity_type", () => {
		const bytes = fixtureOf({ ...LINE, entity_type: "VESSEL" });
		expect(() => decodeFixture(bytes)).toThrow(/not PERSON or ORGANIZATION/);
	});

	it("REJECTS an empty fixture", () => {
		expect(() => decodeFixture(gzipSync(Buffer.from("\n")))).toThrow(
			/fixture is empty/,
		);
	});
});

describe("sha256Hex", () => {
	it("hashes the empty string to the known SHA-256 constant", () => {
		expect(sha256Hex("")).toBe(
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		);
	});

	it("changes when one byte changes", () => {
		expect(sha256Hex("a")).not.toBe(sha256Hex("b"));
	});
});
