// Thin entry for `pnpm --filter @amlfilter/publisher run sync-live-bundle`
// (kept apart from syncLiveBundle.ts so tests can import it without a fetch).

import { runMirrorPublishedOrigin } from "./mirrorPublishedOrigin.ts";
import { liveBundleArgv } from "./syncLiveBundle.ts";

runMirrorPublishedOrigin(liveBundleArgv(process.argv.slice(2))).catch(
	(err: unknown) => {
		process.stderr.write(
			`sync-live-bundle: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		process.exit(1);
	},
);
