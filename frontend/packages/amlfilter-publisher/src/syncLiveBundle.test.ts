// syncLiveBundle — pull the REAL signed production watchlists for local runs.
//
// The committed bundle under app/public/bundle/origin is a tiny fictional
// fixture (2–3 entities per list) so tests and cold clones work offline. To
// screen against the real OFAC / UN / EU / UK lists locally, mirror the live
// bundle through the same fail-closed verifier the deploy uses, pinned to the
// production trust root, into a gitignored directory the app can point at.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseMirrorArgs } from "./mirrorPublishedOrigin.ts";
import {
	LIVE_BUNDLE_BASE_URL,
	liveBundleArgv,
	liveBundleOutDir,
	productionPubkeyPath,
} from "./syncLiveBundle.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_PUBLIC = resolve(HERE, "..", "..", "..", "app", "public");

describe("syncLiveBundle defaults", () => {
	it("mirrors the production origin", () => {
		expect(LIVE_BUNDLE_BASE_URL).toBe("https://aml-filter.com/bundle/origin");
	});

	it("verifies against the app's pinned production key, never the demo key", () => {
		expect(productionPubkeyPath()).toBe(join(APP_PUBLIC, "public.key"));
	});

	it("writes beside, never over, the committed fixture bundle", () => {
		expect(liveBundleOutDir()).toBe(join(APP_PUBLIC, "bundle", "live"));
		expect(liveBundleOutDir()).not.toBe(join(APP_PUBLIC, "bundle", "origin"));
	});

	it("produces argv the mirror CLI accepts, with overrides", () => {
		expect(parseMirrorArgs(liveBundleArgv([]))).toEqual({
			baseUrl: LIVE_BUNDLE_BASE_URL,
			pubkeyPath: productionPubkeyPath(),
			outDir: liveBundleOutDir(),
		});
		expect(
			parseMirrorArgs(
				liveBundleArgv(["--base-url", "https://example.test/origin/"]),
			).baseUrl,
		).toBe("https://example.test/origin");
	});
});
