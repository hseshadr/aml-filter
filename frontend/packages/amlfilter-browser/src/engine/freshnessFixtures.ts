// Test-only freshness fixtures.
//
// Every catalog entry and every `meta.json` now carries a REQUIRED per-list
// freshness block (see `ListFreshness` in watchlist.ts) — a bundle that cannot
// state how old each list is, is rejected. That makes freshness part of the
// literal shape of every catalog fixture in this package, so it lives here once
// instead of being retyped in five test files.
//
// NOT exported from any production barrel — imported only by *.test.ts files.
// Deliberately free of `node:` imports so jsdom-environment specs can use it.

import type { ListFreshness } from "./watchlist";

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
