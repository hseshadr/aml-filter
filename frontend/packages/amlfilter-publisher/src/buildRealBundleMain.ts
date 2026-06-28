// Thin entry for `pnpm --filter @amlfilter/publisher run build-real-bundle`:
// drives buildRealBundle.ts's runRealBundle() with the CLI argv. Kept separate
// from the library module so the unit test can import stagedListsFromSources
// without this top-level run firing.

import { runRealBundle } from "./buildRealBundle.ts";

runRealBundle(process.argv.slice(2)).catch((err: unknown) => {
	process.stderr.write(
		`build-real-bundle: ${err instanceof Error ? err.message : String(err)}\n`,
	);
	process.exit(1);
});
