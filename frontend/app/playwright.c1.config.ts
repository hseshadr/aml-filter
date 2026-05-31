import { defineConfig, devices } from "@playwright/test";

/**
 * C1 e2e: the headline in-browser screening flow, proven against the REAL
 * MINIFIED production build — the lane the default `playwright.config.ts` never
 * exercises (it runs `vite dev`, which is unminified and so hid the production
 * `Ke(...).call is not a function` model-load crash).
 *
 * Two webServers, started by Playwright:
 *   - `vite preview` over a freshly built dist/ (minified SPA + pinned pubkey),
 *     with VITE_BUNDLE_BASE_URL baked to the catalog origin below;
 *   - a CORS static server for the committed signed OFAC bundle.
 *
 * The spec drives a real headless Chromium: it waits for the full
 * sync → verify → ~25 MB model download → screen pipeline, then asserts a real
 * explainable match for a sanctioned name and an empty result for a nonsense
 * name. `http://localhost` is a secure context, so OPFS works with no COOP/COEP.
 */
const CATALOG_PORT = 8911;
const SPA_PORT = 4175;

export default defineConfig({
	testDir: "tests/e2e-c1",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: 0,
	workers: 1,
	reporter: [["list"]],
	timeout: 180_000,
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
			// Build the minified SPA with the bundle origin baked in, then preview it.
			command: `pnpm build && pnpm exec vite preview --port ${SPA_PORT} --strictPort`,
			url: `http://localhost:${SPA_PORT}/screen`,
			reuseExistingServer: !process.env.CI,
			timeout: 180_000,
			env: { VITE_BUNDLE_BASE_URL: `http://localhost:${CATALOG_PORT}` },
		},
		{
			command: "node tests/e2e-c1/catalog-server.mjs",
			url: `http://localhost:${CATALOG_PORT}/latest`,
			reuseExistingServer: !process.env.CI,
			timeout: 30_000,
			env: { CATALOG_PORT: String(CATALOG_PORT) },
		},
	],
});
