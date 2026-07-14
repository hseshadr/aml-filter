// Thin entry for `pnpm --filter @amlfilter/publisher run verify-published-origin`:
// drives verifyPublishedOrigin.ts's runVerifyPublishedOrigin() with the CLI
// argv. Kept separate from the library module so the unit tests can import the
// verifier without this top-level run firing (mirrors buildRealBundleMain.ts).

import { runVerifyPublishedOrigin } from "./verifyPublishedOrigin.ts";

runVerifyPublishedOrigin(process.argv.slice(2)).catch((err: unknown) => {
	process.stderr.write(
		`verify-published-origin: ${err instanceof Error ? err.message : String(err)}\n`,
	);
	process.exit(1);
});
