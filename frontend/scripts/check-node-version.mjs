#!/usr/bin/env node
/**
 * Node-version preflight for the canonical gate.
 *
 * WHY THIS EXISTS
 *
 * CI installs Node from `frontend/.nvmrc` (`actions/setup-node` with
 * `node-version-file: frontend/.nvmrc`). Nothing made the LOCAL gate honour that
 * file, so `pnpm run gate` ran on whatever Node happened to be active — in
 * practice v24.16.0 while CI ran 22.13.0.
 *
 * That is not a cosmetic difference. Three receipt tests
 * (packages/amlfilter-browser/src/engine/scoreReceipt.test.ts) were reported
 * green locally on every run while being permanently broken on CI: Node 22's
 * WebCrypto rejects the cross-realm bare `ArrayBuffer` that @noble/ed25519
 * passes to `subtle.digest`, and Node 24 accepts it. Same commit, same lockfile
 * — the runtime alone flipped the result. A green gate produced on a runtime CI
 * never uses is not evidence.
 *
 * So this FAILS rather than warns. A warning is precisely what got ignored for a
 * whole session: it scrolls past above several minutes of subsequent output and
 * the gate still exits 0, which is the only signal anyone reads.
 *
 * WHY EXACT MATCH, NOT `>=`
 *
 * `package.json` already carries `engines.node: ">=22.13"`, and 24.16.0
 * satisfies it — a floor cannot catch this class of bug, because the bug was a
 * behavioural change in a LATER major. `.nvmrc` pins one exact build and
 * setup-node installs exactly that build, so "identical to CI" is the only
 * property worth asserting. Bumping Node is a deliberate act: edit `.nvmrc`, and
 * local + CI move together.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The single source of truth — the same file `actions/setup-node` reads. */
export const NVMRC = new URL("../.nvmrc", import.meta.url);

const normalize = (version) => version.trim().replace(/^v/, "");

/**
 * Compare the running Node against the pinned one.
 *
 * @param {string} activeVersion `process.version`, e.g. "v22.13.0".
 * @param {string} nvmrcSource Raw `.nvmrc` contents.
 * @returns {{ ok: boolean, message: string }}
 */
export function nodeVersionVerdict(activeVersion, nvmrcSource) {
	const pinned = normalize(nvmrcSource);
	const active = normalize(activeVersion);

	if (pinned === "") {
		return {
			ok: false,
			message:
				"Node preflight: .nvmrc is empty, so the gate cannot prove it is running the version CI uses. Pin an exact version (e.g. 22.13.0).",
		};
	}

	if (active === pinned) {
		return {
			ok: true,
			message: `Node preflight: ${active} matches .nvmrc — same runtime as CI.`,
		};
	}

	return {
		ok: false,
		message: [
			`Node preflight FAILED: this shell runs Node ${active}, but .nvmrc pins ${pinned}.`,
			"",
			`CI installs ${pinned} from frontend/.nvmrc, so a gate run on ${active} proves nothing about CI.`,
			"That skew is exactly how three permanently-broken tests were reported green locally.",
			"",
			"Fix it:",
			`  nvm install ${pinned} && nvm use ${pinned}   # from frontend/, 'nvm use' alone reads .nvmrc`,
			"",
			"Intentionally moving the project to a new Node? Edit frontend/.nvmrc so local and CI move together.",
		].join("\n"),
	};
}

function main() {
	const verdict = nodeVersionVerdict(
		process.version,
		readFileSync(NVMRC, "utf8"),
	);
	if (!verdict.ok) {
		console.error(verdict.message);
		process.exit(1);
	}
	console.log(verdict.message);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
