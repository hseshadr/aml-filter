// The deploy must not be hostage to a third-party sanctions feed.
//
// 2026-07-30: every deploy to aml-filter.com failed. Treasury put the OFAC
// sanctions-list service behind an AWS WAF; the publisher's bare `fetch` was
// 403ed; the "Build + sign the real watchlist bundle" step exited non-zero and
// the whole job died. A docs-only change could not ship because a government
// website had a bad minute.
//
// Two structural faults made a feed blip fatal, and this suite pins both shut:
//
//   1. ORDERING — the step ran `rm -rf "$ORIGIN"` BEFORE the build, so a failed
//      build left no bundle at all. The build must produce its tree somewhere
//      else and only replace the served origin once it has SUCCEEDED.
//   2. NO FALLBACK — there was nothing to fall back TO. On feed failure the
//      deploy must re-publish the bytes already live (mirrorPublishedOrigin),
//      which re-verifies the full signed trust chain, and carry on.
//
// What must NOT happen: shipping an empty/partial/unsigned bundle, relaxing the
// signature gate, or quietly presenting an old list as current. The mirrored
// pointer keeps its ORIGINAL build date, and the workflow must say out loud
// that the list was not refreshed.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"..",
	"..",
);
const deployYaml = readFileSync(
	resolve(repoRoot, ".github", "workflows", "deploy.yml"),
	"utf8",
);

/** The served tree the SPA build copies into dist/. */
const ORIGIN_VAR = "$GITHUB_WORKSPACE/frontend/app/public/bundle/origin";

describe("deploy.yml survives a sanctions-feed outage", () => {
	it("never destroys the served origin before the build has succeeded", () => {
		// The original bug, verbatim: `rm -rf "$ORIGIN"` on the line(s)
		// preceding the build. Any `rm -rf` of the origin must be guarded by a
		// successful build, so it may only appear AFTER the build step ran.
		const buildIndex = deployYaml.indexOf("run build-real-bundle");
		expect(buildIndex).toBeGreaterThan(-1);

		const beforeBuild = deployYaml.slice(0, buildIndex);
		expect(beforeBuild).not.toMatch(/rm -rf "\$ORIGIN"/);
	});

	it("builds the candidate bundle outside the served origin", () => {
		// The build's --out must be a scratch dir, not the live-served tree.
		const outFlag = /--out\s+"?(\$\{?[A-Z_]+\}?[^"\s\\]*)"?/.exec(deployYaml);
		expect(outFlag).not.toBeNull();
		expect(outFlag?.[1]).not.toContain("public/bundle/origin");
	});

	it("does not let a failed bundle build abort the whole deploy", () => {
		// The build step must capture its outcome rather than killing the job.
		expect(deployYaml).toMatch(/BUNDLE_REFRESHED/);
		expect(deployYaml).toMatch(
			/continue-on-error:\s*true|\|\|\s*BUNDLE_REFRESHED=false|set \+e/,
		);
	});

	it("falls back to re-publishing the bytes already live", () => {
		expect(deployYaml).toMatch(/mirror-published-origin/);
	});

	it("still verifies the signed bundle against the pinned public key", () => {
		// The existing fail-closed covenant must be untouched by the fallback.
		expect(deployYaml).toMatch(/edgeproc sync/);
		expect(deployYaml).toMatch(/public\.key/);
	});

	it("announces a non-refreshed list instead of passing it off as current", () => {
		expect(deployYaml).toMatch(/::warning::/);
		// The post-deploy verifier must assert the version actually served, so a
		// mirrored deploy cannot be checked against today's date and pass by luck.
		expect(deployYaml).toMatch(/--expect-version "\$SERVED_VERSION"/);
		expect(deployYaml).toMatch(/--expect-sequence "\$SERVED_SEQUENCE"/);
	});

	it("never ships an unsigned or emptied origin", () => {
		// The real guarantee is ORDER, not wording: whatever ends up in the
		// served origin — freshly built or mirrored — must clear the pinned-key
		// signature gate BEFORE anything is uploaded. Assert the pipeline order.
		const promote = deployYaml.indexOf("Promote the fresh bundle");
		const verify = deployYaml.indexOf(
			"Verify the signed bundle against the pinned public key",
		);
		const upload = deployYaml.indexOf("wrangler@");
		expect(promote).toBeGreaterThan(-1);
		expect(verify).toBeGreaterThan(promote);
		expect(upload).toBeGreaterThan(verify);
		expect(deployYaml).toContain(ORIGIN_VAR);
	});

	it("aborts the deploy if the fallback mirror itself fails", () => {
		// Without `set -e` a failed mirror would leave an EMPTY origin dir and
		// the job would sail on to upload a watchlist-less site.
		const promote = deployYaml.indexOf("Promote the fresh bundle");
		const nextStep = deployYaml.indexOf("- name:", promote + 1);
		const promoteStep = deployYaml.slice(promote, nextStep);
		expect(promoteStep).toMatch(/set -euo pipefail/);
	});
});
