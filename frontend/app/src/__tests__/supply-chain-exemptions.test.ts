import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Release timing is not a trust boundary. Exact versions, frozen locks, registry
// provenance, integrity hashes, and unsuppressed audits remain mandatory, but a
// package must not be accepted or rejected merely because of its publication age.

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const workspaceFile = resolve(appDir, "..", "pnpm-workspace.yaml");

function activeReleaseAgeLines(yaml: string): string[] {
	return yaml.split("\n").filter((line) => /^\s*minimumReleaseAge\s*:/.test(line));
}

describe("pnpm dependency policy", () => {
	it("pins nanoid to the patched 3.x line", () => {
		const yaml = readFileSync(workspaceFile, "utf8");
		expect(yaml).toContain('nanoid: ">=3.3.17 <4"');
	});

	it("does not delay exact registry dependencies with a release-age policy", () => {
		const found = activeReleaseAgeLines(readFileSync(workspaceFile, "utf8"));
		expect(found, "remove minimumReleaseAge; verify trust through exact artifacts").toEqual([]);
	});
});
