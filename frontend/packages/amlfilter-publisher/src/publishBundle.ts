// Shell out to `edgeproc publish` to chunk + Ed25519-sign a staged tree into the
// content-addressed `origin/{latest, manifest/<hash>, chunk/<hash>}` layout the
// in-tab sync tier consumes. LOCAL-only build step: requires `uv` + an edge-proc
// checkout. The --key is a raw 32-byte Ed25519 seed (fixtures/demo.key); the
// produced /latest signature verifies against the committed public.key.
//
// `edgeprocPublishArgs` is split out (pure) so the invocation contract is unit-
// testable without spawning a subprocess.

import { spawn } from "node:child_process";

/** Default edge-proc checkout location: a sibling checkout next to this repo.
 *  Override per call (edgeprocDir) or via the EDGEPROC_DIR env var. */
const DEFAULT_EDGEPROC_DIR = "../edge-proc";

/** Inputs to one `edgeproc publish` run (all paths absolute). */
export interface PublishBundleInput {
	readonly srcDir: string;
	readonly originDir: string;
	/** Raw 32-byte Ed25519 seed file (e.g. fixtures/demo.key). */
	readonly keyPath: string;
	readonly bundleId: string;
	readonly version: string;
	/** Repository-wide monotonic publish counter, signed into /latest. */
	readonly sequence: number;
	/** edge-proc checkout; defaults to DEFAULT_EDGEPROC_DIR / EDGEPROC_DIR. */
	readonly edgeprocDir?: string;
}

/** The resolved `uv run … edgeproc publish …` command + argv. */
export interface EdgeprocCommand {
	readonly command: string;
	readonly args: readonly string[];
}

/** Build the exact `uv run --project <dir> edgeproc publish …` invocation. */
export function edgeprocPublishArgs(
	input: PublishBundleInput,
): EdgeprocCommand {
	if (!Number.isSafeInteger(input.sequence) || input.sequence < 0) {
		throw new Error("sequence must be a non-negative safe integer");
	}
	const edgeprocDir =
		input.edgeprocDir ?? process.env.EDGEPROC_DIR ?? DEFAULT_EDGEPROC_DIR;
	return {
		command: "uv",
		args: [
			"run",
			"--project",
			edgeprocDir,
			"edgeproc",
			"publish",
			"--src",
			input.srcDir,
			"--origin-dir",
			input.originDir,
			"--key",
			input.keyPath,
			"--bundle-id",
			input.bundleId,
			"--version",
			input.version,
			"--sequence",
			String(input.sequence),
			"--pretty",
		],
	};
}

/** Run `edgeproc publish`, streaming its output; reject on a non-zero exit. */
export function publishBundle(input: PublishBundleInput): Promise<void> {
	const { command, args } = edgeprocPublishArgs(input);
	return new Promise<void>((resolvePromise, rejectPromise) => {
		const child = spawn(command, [...args], { stdio: "inherit" });
		child.on("error", rejectPromise);
		child.on("close", (code) => {
			if (code === 0) {
				resolvePromise();
				return;
			}
			rejectPromise(new Error(`edgeproc publish exited with code ${code}`));
		});
	});
}
