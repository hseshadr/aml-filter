/**
 * Watchlist sync orchestration (Wave 2, bidirectional auto-rescan).
 *
 * The loaded watchlist version is only known AFTER the screening engine has
 * bootstrapped. `runWatchlistSync` reads that version off the handle; if the
 * engine has not booted yet it returns null so the caller can retry once the
 * engine is ready. Otherwise it delegates to the package's idempotent
 * RescanService.syncWatchlist — a no-op when the stored version already matches.
 */

import type { SyncResult } from "@amlfilter/workstation";
import type { WorkstationHandle } from "./workstation";

/**
 * Sync the in-tab KYC records against the currently-loaded watchlist version.
 * Returns null when the engine has not booted yet (no version to sync against);
 * otherwise the SyncResult (changed:false when already current).
 */
export async function runWatchlistSync(
	handle: WorkstationHandle,
): Promise<SyncResult | null> {
	const version = handle.watchlistVersion();
	if (version === null) {
		return null;
	}
	return handle.rescan.syncWatchlist(version);
}

/** Plain-language one-liner for a completed sync — shared by every surface. */
export function syncSummaryText(result: SyncResult): string {
	if (!result.changed) {
		return "Watchlist already current.";
	}
	return `Re-screened ${result.customersScanned} customer(s) — ${result.newHits} new hit(s), ${result.clearedHits} cleared.`;
}
