import { defineConfig, devices } from "@playwright/test";

/**
 * C1 e2e: the headline in-browser screening flow, proven against the REAL
 * MINIFIED production build — the lane the default `playwright.config.ts` never
 * exercises (it runs `vite dev`, which is unminified and so hid the production
 * `Ke(...).call is not a function` model-load crash).
 *
 * ONE webServer: `vite preview` over a freshly built dist/. The v3 signed
 * watchlist (watchlist.json + .sig + manifest, in app/public/watchlist/) is a
 * plain static asset served same-origin by `vite preview` — no separate catalog
 * server, no VITE_BUNDLE_BASE_URL. The pinned ed25519 public key
 * (app/public/public.key) ships in the same build and is read same-origin.
 *
 * The spec drives a real headless Chromium: it waits for the full
 * download → ed25519-verify → ~23 MB model download → screen pipeline, then
 * asserts a real explainable match for the committed sanctioned name and an
 * empty result for a nonsense name. `http://localhost` is a secure context, so
 * OPFS + WebCrypto work with no COOP/COEP.
 */
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
			// Build the minified SPA (which bundles the committed signed watchlist
			// + pinned pubkey as static public/ assets), then preview it.
			command: `pnpm build && pnpm exec vite preview --port ${SPA_PORT} --strictPort`,
			url: `http://localhost:${SPA_PORT}/screen`,
			reuseExistingServer: !process.env.CI,
			timeout: 180_000,
			// VITE_MODEL_LOAD_TIMEOUT_MS bounds the warmup so the cold/blocked spec's
			// "everything blocked" case fails LOUDLY within seconds instead of the
			// 120s production ceiling. A local (or self-hosted) model load finishes
			// well under this bound, so the warm specs are unaffected.
			env: {
				VITE_MODEL_LOAD_TIMEOUT_MS: "45000",
			},
		},
	],
});
