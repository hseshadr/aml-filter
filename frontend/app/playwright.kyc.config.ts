import { defineConfig, devices } from "@playwright/test";

/**
 * e2e-kyc — the LOCAL-FIRST KYC workstation journey, proven END-TO-END in a
 * real headless Chromium against the MINIFIED production build with ZERO
 * application backend: the OFAC list is the committed signed demo bundle
 * (backend/examples/catalog) verified against the pinned key, and KYC records
 * live in SQLite-WASM persisted to OPFS via the DB Worker.
 *
 * Two Playwright-managed webServers (the C1 pattern):
 *   - `vite preview` over a freshly built dist/ with VITE_BUNDLE_BASE_URL
 *     baked to the catalog origin;
 *   - the CORS static catalog server reused from the C1 suite, serving the
 *     committed signed bundle.
 *
 * `http://localhost` is a secure context — REQUIRED for OPFS (both the
 * bundle cache and the sahpool database) and WebCrypto verification. A LAN
 * IP or host.docker.internal is NOT a secure context and does not count as
 * validation (CLAUDE.md browser-validation mandate).
 */
const CATALOG_PORT = Number(process.env.E2E_KYC_CATALOG_PORT ?? 8912);
const SPA_PORT = Number(process.env.E2E_KYC_SPA_PORT ?? 4178);

export default defineConfig({
	testDir: "tests/e2e-kyc",
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
			// Minified SPA with the catalog origin baked in. The model-load
			// ceiling is bounded so a blocked weights path fails loudly in
			// seconds (same rationale as the C1 config).
			command: `pnpm build && pnpm exec vite preview --port ${SPA_PORT} --strictPort`,
			url: `http://localhost:${SPA_PORT}/`,
			reuseExistingServer: !process.env.CI,
			timeout: 180_000,
			env: {
				VITE_BUNDLE_BASE_URL: `http://localhost:${CATALOG_PORT}`,
				VITE_MODEL_LOAD_TIMEOUT_MS: "45000",
			},
		},
		{
			// The committed signed demo bundle, served with CORS — the REAL
			// artifact + the REAL pinned key, not a synthetic stand-in.
			command: "node tests/e2e-c1/catalog-server.mjs",
			url: `http://localhost:${CATALOG_PORT}/latest`,
			reuseExistingServer: !process.env.CI,
			timeout: 30_000,
			env: { CATALOG_PORT: String(CATALOG_PORT) },
		},
	],
});
