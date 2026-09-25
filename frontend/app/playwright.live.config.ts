import { defineConfig, devices } from "@playwright/test";

/**
 * LIVE smoke: drives the DEPLOYED site (default https://aml-filter.com) in a
 * real Chromium after every production deploy and list publish, and on a
 * schedule. It is deliberately NOT part of `pnpm gate` — the gate must not
 * depend on the network or on production being up.
 *
 * No webServer: the target is whatever LIVE_SMOKE_URL names. It must be a
 * secure context (https, or http://localhost for the local rehearsal) because
 * in-tab signature verification needs WebCrypto and the bundle cache needs OPFS.
 *
 * Passes are selected with --grep @fresh | @prime | @returning (see the spec).
 * Run from frontend/app:
 *   pnpm test:e2e:live --grep @fresh
 */
export default defineConfig({
	testDir: "tests/e2e-live",
	fullyParallel: false,
	forbidOnly: true,
	// One retry absorbs a transient network blip on a shared runner; a real
	// breakage fails both attempts, and the failure (not the retry) is reported.
	retries: 1,
	workers: 1,
	reporter: [["list"]],
	expect: { timeout: 30_000 },
	use: {
		baseURL: process.env.LIVE_SMOKE_URL ?? "https://aml-filter.com",
		headless: true,
		actionTimeout: 30_000,
		navigationTimeout: 60_000,
		trace: "retain-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
