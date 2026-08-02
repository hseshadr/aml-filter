// Test-only freshness fixtures.
//
// A NEW-FORMAT catalog entry / `meta.json` carries a per-list freshness block
// (see `ListFreshness` in watchlist.ts). That makes freshness part of the
// literal shape of every catalog fixture in this package, so it lives here once
// instead of being retyped in five test files.
//
// TWO SHAPES, deliberately. `FRESH`/`STALE` are the WIRE block a publisher
// stages. `*_RESOLVED` are what the bundle path projects onto a catalog entry
// after the shared rule runs — the same fields plus `agedFrom`, which records
// WHICH instant the age came from. A pre-per-list-freshness bundle carries no
// wire block at all and resolves with `agedFrom: "generatedAt"`.
//
// NOT exported from any production barrel — imported only by *.test.ts files.
// Deliberately free of `node:` imports so jsdom-environment specs can use it.

import type { ListFreshness, ResolvedListFreshness } from "./watchlist";

/** A list refreshed successfully this run: fresh, no reason. */
export const FRESH: ListFreshness = {
	fetchedAt: "2026-08-01T00:00:00Z",
	sourceUpdatedAt: "2026-07-31T00:00:00Z",
	stale: false,
	staleReason: null,
};

/** A list the publisher could NOT refresh, re-served from the last good copy —
 * keeping the instant it was ORIGINALLY fetched, so its age is its real age. */
export const STALE: ListFreshness = {
	fetchedAt: "2026-07-29T00:00:00Z",
	sourceUpdatedAt: null,
	stale: true,
	staleReason: "EU feed returned HTTP 500",
};

/** {@link FRESH} as a PROJECTED catalog entry carries it. */
export const FRESH_RESOLVED: ResolvedListFreshness = {
	...FRESH,
	agedFrom: "fetchedAt",
};

/** {@link STALE} as a PROJECTED catalog entry carries it. */
export const STALE_RESOLVED: ResolvedListFreshness = {
	...STALE,
	agedFrom: "fetchedAt",
};
