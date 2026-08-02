import { defineConfig, devices } from "@playwright/test";

/**
 * bundle e2e: the SIGNED, content-addressed BUNDLE delta-sync boot path, proven
 * END-TO-END in a real headless Chromium over the MINIFIED production build.
 *
 * Unlike the C1/KYC lanes (which take the same-origin `watchlist/` JSON path
 * with NO VITE_BUNDLE_BASE_URL), this lane sets VITE_BUNDLE_BASE_URL to the
 * committed bundle origin served same-origin at `/bundle/origin` (the
 * `app/public/bundle/origin/{latest,manifest,chunk}` CAS tree bundled into
 * dist/). The engine therefore delta-syncs + verifies the signed `/latest`
 * pointer (cache:no-store), content-verifies the manifest + every chunk + every
 * reassembled file against the pinned same-origin `public.key`, atomically
 * promotes into OPFS, and screens from the materialized lists.
 *
 * `http://localhost` is a secure context — REQUIRED for OPFS (the bundle's
 * durable CacheStore) and WebCrypto Ed25519 verification. A LAN IP or
 * host.docker.internal is NOT a secure context and does not count as validation
 * (CLAUDE.md browser-validation mandate); host Playwright on localhost is the
 * runner, NOT the Docker browser-MCP.
 */
const SPA_PORT = Number(process.env.E2E_BUNDLE_SPA_PORT ?? 4176);

export default defineConfig({
	testDir: "tests/e2e-bundle",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	// The ~23 MB MiniLM compile in-tab is a one-time cold cost that varies on
	// shared CI runners; retry to absorb that variance. 0 retries locally to
	// surface real flakes.
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: [["list"]],
	timeout: 240_000,
	expect: { timeout: 30_000 },
	use: {
		baseURL: `http://localhost:${SPA_PORT}`,
		headless: true,
		actionTimeout: 30_000,
		navigationTimeout: 30_000,
		trace: "retain-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: [
		{
			// Build the minified SPA with the bundle path ENABLED (the committed
			// signed bundle origin is bundled into dist/ as static public/ assets and
			// served same-origin at /bundle/origin), then preview it.
			command: `pnpm build && pnpm exec vite preview --port ${SPA_PORT} --strictPort`,
			url: `http://localhost:${SPA_PORT}/screen`,
			reuseExistingServer: !process.env.CI,
			timeout: 240_000,
			env: {
				// THE switch: take the signed-bundle delta-sync path, not JSON.
				VITE_BUNDLE_BASE_URL: "/bundle/origin",
				// 120s production ceiling — full headroom for a cold in-tab model
				// compile on a slow CI runner.
				VITE_MODEL_LOAD_TIMEOUT_MS: "120000",
				// The overall boot ceiling, lowered from its 900s production value so
				// `boot-ceiling.spec.ts` can actually WATCH it fire. That spec holds a
				// sync in the slow-but-moving state — one `sync-progress` tick every
				// fake-20s, which keeps re-arming the 30s no-progress watchdog — until
				// the ceiling expires. Every tick costs a chunk and this fixture bundle
				// has 13, so the deadline under test must be reachable inside ~13
				// ticks; 900s is not. The PRODUCTION value is pinned by unit tests
				// instead (runtime.test.ts, "cannot fire before a healthy slow-link
				// cold download has finished"). 200s is LOOSER than the 180s this lane
				// inherited before, so no existing bundle spec loses headroom.
				VITE_BOOT_TIMEOUT_MS: "200000",
				// No pubkey env here on purpose: the local preview server pairs the
				// committed demo bundle with the demo verify key by default
				// (vite.config localDemoPubkeyPin), the way a cold clone does.
			},
		},
	],
});
