import { resolve } from "node:path";
import { snapshotSources } from "./snapshotSources.ts";

function outputRoot(args: ReadonlyArray<string>): string {
	const index = args.indexOf("--out");
	const value = index < 0 ? undefined : args[index + 1];
	if (value === undefined || value.trim() === "") {
		throw new Error("snapshot: --out <directory> is required");
	}
	return resolve(value);
}

snapshotSources(outputRoot(process.argv.slice(2))).catch((error: unknown) => {
	process.stderr.write(
		`snapshot: ${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exitCode = 1;
});
