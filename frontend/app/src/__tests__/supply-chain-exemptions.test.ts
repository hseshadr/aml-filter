import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// pnpm's `minimumReleaseAge` cooldown is a supply-chain control: it refuses to
// install a version published less than N days ago — the window in which a
// compromised release is usually caught and unpublished. pnpm v11 evaluates that
// cooldown in NON-STRICT mode, so a plain (non-frozen) `pnpm install` SILENTLY
// writes an exemption list into frontend/pnpm-workspace.yaml:
//
//   minimumReleaseAgeExclude:
//     - '@edgeproc/avow@0.1.0'
//
// Nothing prints and nothing fails — the developer is just left holding a
// modified workspace file that rides along in the next `git commit -a`. That has
// already happened on this repo (fcac972, reverted by bab953c). A committed
// exemption permanently disables the cooldown for the listed packages, turning a
// security control off by accident, so this guard fails the gate the moment the
// key reappears as an active setting.

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const workspaceFile = resolve(appDir, "..", "pnpm-workspace.yaml");

/** The pnpm setting that opts a package OUT of the release-age cooldown. */
const EXEMPTION_KEY = "minimumReleaseAgeExclude";

/** Matches the exemption as a YAML key at any indentation. */
const EXEMPTION_KEY_LINE = new RegExp(`^\\s*${EXEMPTION_KEY}\\s*:`);

/** A `#`-prefixed line is inert to pnpm, so it documents the ban, not a breach. */
function isComment(line: string): boolean {
	return line.trimStart().startsWith("#");
}

/**
 * 1-based line numbers at which `minimumReleaseAgeExclude` appears as an ACTIVE
 * YAML key in the given workspace file text.
 */
function findExemptionKeyLines(yaml: string): number[] {
	const hits: number[] = [];
	yaml.split("\n").forEach((line, index) => {
		if (!isComment(line) && EXEMPTION_KEY_LINE.test(line)) {
			hits.push(index + 1);
		}
	});
	return hits;
}

/** The actionable remediation shown when the guard trips. */
function remediation(lines: readonly number[]): string {
	return [
		`\`${EXEMPTION_KEY}\` is committed in frontend/pnpm-workspace.yaml`,
		`(line ${lines.join(", ")}). It must NEVER be committed.`,
		"",
		"WHY IT IS THERE: pnpm v11 runs the `minimumReleaseAge` cooldown in",
		"non-strict mode, so ANY non-frozen `pnpm install` auto-injects this key",
		"and prints nothing. It was almost certainly added by a local install, not",
		"on purpose.",
		"",
		"WHAT IT BREAKS: it permanently disables the release-age supply-chain",
		"cooldown for every package listed under it, so a compromised fresh release",
		"of those packages installs without resistance.",
		"",
		"HOW TO REMOVE: delete the whole `minimumReleaseAgeExclude:` block (the key",
		"and its `- 'pkg@version'` entries) from frontend/pnpm-workspace.yaml, then",
		"re-run `pnpm install --frozen-lockfile` to confirm the tree is unchanged.",
		"",
		"If a dependency genuinely trips the cooldown, WAIT THE COOLDOWN OUT — the",
		"gate is working as designed. Never exempt the package to go green.",
	].join("\n");
}

describe("pnpm supply-chain exemption guard", () => {
	it("keeps frontend/pnpm-workspace.yaml free of minimumReleaseAgeExclude", () => {
		const found = findExemptionKeyLines(readFileSync(workspaceFile, "utf8"));
		expect(found, remediation(found)).toEqual([]);
	});

	it("detects the exemption block pnpm injects", () => {
		// Non-vacuity, asserted in the suite itself: this is the EXACT shape pnpm
		// writes, so the guard above is proven to catch a real injection rather
		// than passing because it never matches anything.
		const injected = [
			"packages:",
			"  - app",
			"  - packages/*",
			"",
			"minimumReleaseAgeExclude:",
			"  - '@edgeproc/avow@0.1.0'",
		].join("\n");
		expect(findExemptionKeyLines(injected)).toEqual([5]);
	});

	it("detects the key at any indentation", () => {
		expect(findExemptionKeyLines("  minimumReleaseAgeExclude:\n")).toEqual([1]);
	});

	it("treats a commented-out mention as inert", () => {
		// Comments are how this file DOCUMENTS the ban; they must not trip the guard.
		const documented = [
			"# Never commit minimumReleaseAgeExclude: pnpm injects it silently.",
			"  # minimumReleaseAgeExclude:",
			"packages:",
		].join("\n");
		expect(findExemptionKeyLines(documented)).toEqual([]);
	});

	it("does not fire on the unrelated minimumReleaseAge setting itself", () => {
		// `minimumReleaseAge` is the CONTROL; only the `...Exclude` list is banned.
		expect(findExemptionKeyLines("minimumReleaseAge: 7\n")).toEqual([]);
	});
});
