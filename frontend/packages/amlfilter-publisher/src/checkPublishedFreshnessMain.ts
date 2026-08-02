// Thin entry for `pnpm --filter @amlfilter/publisher run check-published-freshness`:
// drives checkPublishedFreshness.ts's runCheckPublishedFreshness() with the CLI
// argv. Kept separate from the library module so the unit tests can import the
// checker without this top-level run firing (mirrors verifyPublishedOriginMain
// and mirrorPublishedOriginMain).
//
// Exit code is the alert: 0 = the live bundle is as fresh as the product claims,
// 1 = it is not, or its freshness could not be proven. The scheduled
// watchlist-freshness workflow turns that non-zero into a GitHub issue, because
// a red dot on a cron run is exactly the signal that went unread for 22 days.

import { runCheckPublishedFreshness } from "./checkPublishedFreshness.ts";

runCheckPublishedFreshness(process.argv.slice(2)).catch((err: unknown) => {
	process.stderr.write(
		`check-published-freshness: ${err instanceof Error ? err.message : String(err)}\n`,
	);
	process.exit(1);
});
