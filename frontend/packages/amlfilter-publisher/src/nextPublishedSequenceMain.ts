import { runNextPublishedSequence } from "./verifyPublishedOrigin.ts";

runNextPublishedSequence(process.argv.slice(2)).catch((error: unknown) => {
	process.stderr.write(
		`next-published-sequence: ${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exit(1);
});
