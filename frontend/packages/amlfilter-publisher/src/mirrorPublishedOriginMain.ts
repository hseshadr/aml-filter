// Thin entry for `pnpm --filter @amlfilter/publisher run mirror-published-origin`:
// drives mirrorPublishedOrigin.ts's runMirrorPublishedOrigin() with the CLI
// argv. Kept separate from the library module so the unit tests can import the
// mirror without this top-level run firing (mirrors verifyPublishedOriginMain).

import { runMirrorPublishedOrigin } from "./mirrorPublishedOrigin.ts";

runMirrorPublishedOrigin(process.argv.slice(2)).catch((err: unknown) => {
	process.stderr.write(
		`mirror-published-origin: ${err instanceof Error ? err.message : String(err)}\n`,
	);
	process.exit(1);
});
