// toWatchlistEntity defensive branches: a non-array dob (malformed upstream
// record) maps to null instead of crashing, and a record missing a required
// identity field fails loud with the line number and field name.

import { describe, expect, test } from "vitest";
import { toWatchlistEntity } from "./sourceEntity.ts";

const VALID = {
	entity_id: "L:1",
	primary_name: "Jane Q. Entity",
	risk_category: "SANCTION",
	source_list: "L",
	list_version: "v1",
};

describe("toWatchlistEntity defensive branches", () => {
	test("a non-array dob maps to null", () => {
		const entity = toWatchlistEntity({ ...VALID, dob: "1970-01-01" }, 1);
		expect(entity.dob).toBeNull();
	});

	test("a record missing a required field fails with line + field", () => {
		const { entity_id: _dropped, ...missingId } = VALID;
		expect(() => toWatchlistEntity(missingId, 5)).toThrow(
			'source line 5: missing/invalid string field "entity_id"',
		);
	});
});
