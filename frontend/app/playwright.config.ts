import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	// The C1 suite (tests/e2e-c1) has its own config + production webServers; it
	// must not run here against the unminified `vite dev` server.
	testIgnore: "**/e2e-c1/**",
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
