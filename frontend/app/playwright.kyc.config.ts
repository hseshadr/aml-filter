import { defineConfig, devices } from "@playwright/test";

/**
 * e2e-kyc — the FULL DB-backed KYC / AML compliance journey, proven END-TO-END in
 * a real headless Chromium against the MINIFIED production build talking to a LIVE
 * FastAPI + PostgreSQL backend.
 *
 * This is the regression guard the C1 suite never provided: C1 only covers the
 * backend-free in-browser `/screen` tier, NOT the auth-gated `/customers`,
 * `/review`, `/sars`, `/attestations`, `/lists` pages that hit the real backend.
 *
 * Two Playwright-managed webServers:
 *   - the FastAPI app (DB-backed) on `API_PORT`, started by `start-api.sh` which
 *     mints the attestation keypair, migrates the DB, and seeds the deterministic
 *     KYC fixture before exec'ing uvicorn;
 *   - `vite preview` over a freshly built dist/, with `VITE_API_URL` baked to the
 *     API origin so the SPA's axios client hits the live backend.
 *
 * Port discipline (see CLAUDE.md): a Docker service holds :8000 and a stray vite
 * can squat IPv6 :5173, so we deliberately bind the API on `API_PORT` (8010) and
 * the SPA on `SPA_PORT` (4178) over 127.0.0.1, and the spec asserts the page
 * <title> is aml-filter's before trusting the run. `http://localhost` /
 * `127.0.0.1` is a secure context.
 */
const API_PORT = Number(process.env.E2E_KYC_API_PORT ?? 8010);
const SPA_PORT = Number(process.env.E2E_KYC_SPA_PORT ?? 4178);

const DATABASE_URL =
	process.env.E2E_KYC_DATABASE_URL ??
	"postgresql+asyncpg://amlfilter:amlfilter_dev_password@127.0.0.1:5435/amlfilter_e2e_kyc";
const REDIS_URL = process.env.E2E_KYC_REDIS_URL ?? "redis://127.0.0.1:6379/0";

export default defineConfig({
	testDir: "tests/e2e-kyc",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: 0,
	workers: 1,
	reporter: [["list"]],
	timeout: 120_000,
	expect: { timeout: 20_000 },
	use: {
		baseURL: `http://127.0.0.1:${SPA_PORT}`,
		headless: true,
		actionTimeout: 20_000,
		navigationTimeout: 30_000,
		trace: "retain-on-failure",
		// Per-test downloads land here so the SAR/attestation export assertions can
		// read the bytes back and check the %PDF magic header.
		acceptDownloads: true,
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: [
		{
			// DB-backed FastAPI app: schema + seed + run, all idempotent. The script
			// lives in the frontend app's test dir but runs from backend/ (so uv +
			// alembic + scripts resolve), hence the ../frontend path back into it.
			command: "bash ../frontend/app/tests/e2e-kyc/start-api.sh",
			cwd: "../../backend",
			url: `http://127.0.0.1:${API_PORT}/health`,
			reuseExistingServer: !process.env.CI,
			timeout: 180_000,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				DATABASE_URL,
				REDIS_URL,
				E2E_API_PORT: String(API_PORT),
				// EMBEDDING_MODEL_PATH + offline flags are passed through from the
				// environment (CI sets them to the pre-fetched MiniLM weights); locally
				// they are unset and the model is loaded from the HF cache.
				...(process.env.EMBEDDING_MODEL_PATH
					? { EMBEDDING_MODEL_PATH: process.env.EMBEDDING_MODEL_PATH }
					: {}),
				...(process.env.HF_HUB_OFFLINE
					? { HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE }
					: {}),
				...(process.env.TRANSFORMERS_OFFLINE
					? { TRANSFORMERS_OFFLINE: process.env.TRANSFORMERS_OFFLINE }
					: {}),
			},
		},
		{
			// Minified SPA with the live API origin baked in.
			command: `pnpm build && pnpm exec vite preview --host 127.0.0.1 --port ${SPA_PORT} --strictPort`,
			url: `http://127.0.0.1:${SPA_PORT}/login`,
			reuseExistingServer: !process.env.CI,
			timeout: 180_000,
			env: {
				VITE_API_URL: `http://127.0.0.1:${API_PORT}`,
			},
		},
	],
});
