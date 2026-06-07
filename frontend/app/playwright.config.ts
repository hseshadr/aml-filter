import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	// The C1 suite (tests/e2e-c1) and the DB-backed KYC suite (tests/e2e-kyc) each
	// have their own config + production webServers; they must not run here against
	// the unminified `vite dev` server (the KYC suite also needs a live backend).
	testIgnore: ["**/e2e-c1/**", "**/e2e-kyc/**"],
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "html",
	use: {
		baseURL: "http://localhost:5173",
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: "pnpm dev",
		url: "http://localhost:5173",
		reuseExistingServer: !process.env.CI,
	},
});
