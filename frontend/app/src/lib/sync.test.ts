import type { SyncResult } from "@amlfilter/workstation";
import { describe, expect, it, vi } from "vitest";
import { runWatchlistSync, syncSummaryText } from "./sync";
import type { WorkstationHandle } from "./workstation";

function makeHandle(
	version: string | null,
	result?: SyncResult,
): { handle: WorkstationHandle; syncWatchlist: ReturnType<typeof vi.fn> } {
	const syncWatchlist = vi.fn().mockResolvedValue(result);
	const handle = {
		watchlistVersion: () => version,
		rescan: { syncWatchlist },
	} as unknown as WorkstationHandle;
	return { handle, syncWatchlist };
}

const SUMMARY: SyncResult = {
	changed: true,
	version: "v2",
	customersScanned: 3,
	newHits: 1,
	clearedHits: 0,
};

describe("runWatchlistSync", () => {
	it("returns null and does not sync when the engine has not booted", async () => {
		const { handle, syncWatchlist } = makeHandle(null);
		expect(await runWatchlistSync(handle)).toBeNull();
		expect(syncWatchlist).not.toHaveBeenCalled();
	});

	it("passes the loaded version through to syncWatchlist", async () => {
		const { handle, syncWatchlist } = makeHandle("v2", SUMMARY);
		const result = await runWatchlistSync(handle);
		expect(syncWatchlist).toHaveBeenCalledWith("v2");
		expect(result).toEqual(SUMMARY);
	});

	it("surfaces a thrown sync error to the caller", async () => {
		const { handle, syncWatchlist } = makeHandle("v2");
		syncWatchlist.mockRejectedValue(new Error("rescan failed"));
		await expect(runWatchlistSync(handle)).rejects.toThrow(/rescan failed/);
	});
});

describe("syncSummaryText", () => {
	it("reports the rescan counts when the watchlist changed", () => {
		expect(syncSummaryText(SUMMARY)).toBe(
			"Re-screened 3 customer(s) — 1 new hit(s), 0 cleared.",
		);
	});

	it("reports 'already current' when nothing changed", () => {
		expect(
			syncSummaryText({
				changed: false,
				version: "v1",
				customersScanned: 0,
				newHits: 0,
				clearedHits: 0,
			}),
		).toBe("Watchlist already current.");
	});
});
