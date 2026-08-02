// THE ONE FRESHNESS RULE — the single predicate both tiers consume.
//
// WHY IT IS ONE FUNCTION. The same rule used to exist three times: the browser's
// catalog/meta narrow, the publisher's carry-forward anchor, and the publisher's
// staleness gate. Two of them already disagreed on the live bundle — the
// publisher aged a pre-freshness list from `generatedAt` and served it, while the
// browser rejected the identical bytes outright and stopped loading the
// watchlist. Copies of a rule diverge; this suite pins the rule itself so there
// is only ever one answer to give.
//
// The contract (see `resolveListAge` in watchlist.ts):
//   fetchedAt present + parseable -> aged from fetchedAt
//   fetchedAt absent              -> legacy bundle, aged from catalog generatedAt
//   fetchedAt present + malformed -> null. Corruption is never laundered into an
//                                    age, not even a conservative one.

import { describe, expect, it } from "vitest";
import {
	hasFetchedAt,
	resolveListAge,
	resolveListFreshness,
} from "./watchlist";

const GENERATED_AT = "2026-08-01T18:23:54.891Z";
const FETCHED_AT = "2026-07-29T00:00:00Z";

/** A new-format catalog entry: carries its own per-list freshness block. */
function newFormat(): Record<string, unknown> {
	return {
		fetchedAt: FETCHED_AT,
		sourceUpdatedAt: "2026-07-28T00:00:00Z",
		stale: false,
		staleReason: null,
	};
}

/** A pre-freshness ("legacy") entry — exactly what aml-filter.com serves today:
 * NONE of the four freshness fields exist on it. */
function legacy(): Record<string, unknown> {
	return { id: "OFAC_SDN", title: "OFAC SDN" };
}

describe("resolveListAge — which instant a list is aged from", () => {
	it("ages a new-format entry from its own fetchedAt", () => {
		expect(resolveListAge(newFormat(), GENERATED_AT)).toEqual({
			at: FETCHED_AT,
			from: "fetchedAt",
		});
	});

	it("ages a LEGACY entry from the catalog's generatedAt", () => {
		expect(resolveListAge(legacy(), GENERATED_AT)).toEqual({
			at: GENERATED_AT,
			from: "generatedAt",
		});
	});

	it("treats an explicitly-undefined fetchedAt as absent, not as corruption", () => {
		expect(resolveListAge({ fetchedAt: undefined }, GENERATED_AT)).toEqual({
			at: GENERATED_AT,
			from: "generatedAt",
		});
	});

	it.each([
		["empty", ""],
		["blank", "   "],
		["prose", "whenever"],
		["a bare date", "2026-08-01"],
		["a number", 12_345],
		["null", null],
		["an object", { at: FETCHED_AT }],
	])(
		"refuses to fall back when fetchedAt is present but %s",
		(_label, fetchedAt) => {
			// The whole point: a malformed value must NOT be laundered into the
			// generatedAt fallback. "Cannot tell" keeps meaning REJECT.
			expect(resolveListAge({ fetchedAt }, GENERATED_AT)).toBeNull();
		},
	);

	it("returns null when a legacy entry has no parseable generatedAt to fall back to", () => {
		expect(resolveListAge(legacy(), undefined)).toBeNull();
		expect(resolveListAge(legacy(), "whenever")).toBeNull();
		expect(resolveListAge(legacy(), "")).toBeNull();
	});

	it("returns null for a non-object entry", () => {
		expect(resolveListAge(null, GENERATED_AT)).toBeNull();
		expect(resolveListAge("OFAC", GENERATED_AT)).toBeNull();
	});
});

describe("hasFetchedAt — the new-format/legacy discriminator", () => {
	it("is true only when the entry actually carries a fetchedAt value", () => {
		expect(hasFetchedAt(newFormat())).toBe(true);
		expect(hasFetchedAt({ fetchedAt: "nope" })).toBe(true);
		expect(hasFetchedAt({ fetchedAt: null })).toBe(true);
		expect(hasFetchedAt(legacy())).toBe(false);
		expect(hasFetchedAt({ fetchedAt: undefined })).toBe(false);
		expect(hasFetchedAt(null)).toBe(false);
	});
});

describe("resolveListFreshness — the age plus the staleness shape", () => {
	it("resolves a new-format entry verbatim", () => {
		expect(resolveListFreshness(newFormat(), GENERATED_AT)).toEqual({
			fetchedAt: FETCHED_AT,
			agedFrom: "fetchedAt",
			sourceUpdatedAt: "2026-07-28T00:00:00Z",
			stale: false,
			staleReason: null,
		});
	});

	it("resolves a legacy entry as not-stale, aged from the bundle stamp", () => {
		expect(resolveListFreshness(legacy(), GENERATED_AT)).toEqual({
			fetchedAt: GENERATED_AT,
			agedFrom: "generatedAt",
			sourceUpdatedAt: null,
			stale: false,
			staleReason: null,
		});
	});

	it("carries a real stale flag and reason through", () => {
		expect(
			resolveListFreshness(
				{ ...newFormat(), stale: true, staleReason: "EU feed returned 500" },
				GENERATED_AT,
			),
		).toEqual({
			fetchedAt: FETCHED_AT,
			agedFrom: "fetchedAt",
			sourceUpdatedAt: "2026-07-28T00:00:00Z",
			stale: true,
			staleReason: "EU feed returned 500",
		});
	});

	it("still REQUIRES the staleness proof of a new-format entry", () => {
		// A dropped `stale` must not read as healthy — that is shape checked,
		// property not. Legacy entries are exempt (they predate the field), which
		// is why the fallback above is safe.
		const { stale: _stale, ...noStale } = newFormat();
		expect(resolveListFreshness(noStale, GENERATED_AT)).toBeNull();
		const { staleReason: _reason, ...noReason } = newFormat();
		expect(resolveListFreshness(noReason, GENERATED_AT)).toBeNull();
		const { sourceUpdatedAt: _src, ...noSource } = newFormat();
		expect(resolveListFreshness(noSource, GENERATED_AT)).toBeNull();
		expect(
			resolveListFreshness({ ...newFormat(), stale: "yes" }, GENERATED_AT),
		).toBeNull();
		expect(
			resolveListFreshness({ ...newFormat(), staleReason: 7 }, GENERATED_AT),
		).toBeNull();
		expect(
			resolveListFreshness(
				{ ...newFormat(), sourceUpdatedAt: "whenever" },
				GENERATED_AT,
			),
		).toBeNull();
	});

	it("rejects a legacy entry whose optional freshness fields are corrupt", () => {
		// Absent is migration. Present-but-wrong is corruption, in either format.
		expect(
			resolveListFreshness({ ...legacy(), stale: "yes" }, GENERATED_AT),
		).toBeNull();
		expect(
			resolveListFreshness({ ...legacy(), staleReason: 7 }, GENERATED_AT),
		).toBeNull();
		expect(
			resolveListFreshness(
				{ ...legacy(), sourceUpdatedAt: "whenever" },
				GENERATED_AT,
			),
		).toBeNull();
	});

	it("returns null whenever the age itself cannot be resolved", () => {
		expect(resolveListFreshness({ fetchedAt: "" }, GENERATED_AT)).toBeNull();
		expect(resolveListFreshness(legacy(), undefined)).toBeNull();
	});
});
