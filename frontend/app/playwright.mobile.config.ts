import { defineConfig, devices } from "@playwright/test";

/**
 * Mobile browser smoke gate. WebKit approximates iPhone Safari's browser
 * surface; Chromium uses the Pixel 5 Android profile. This is intentionally a
 * separate config because the normal CI gate installs Chromium only.
 */
export default defineConfig({
	testDir: "./tests",
	testMatch: "**/mobile-workstation.spec.ts",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "line",
	use: {
		baseURL: "http://localhost:5173",
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "ios-webkit",
			use: { ...devices["iPhone 13"], browserName: "webkit" },
		},
		{
			name: "android-chromium",
			use: { ...devices["Pixel 5"], browserName: "chromium" },
		},
		{
			name: "desktop-control",
			use: { ...devices["Desktop Chrome"], browserName: "chromium" },
		},
	],
	webServer: {
		command: "pnpm dev",
		url: "http://localhost:5173",
		reuseExistingServer: !process.env.CI,
		// Rotation: the committed demo bundle is signed with the throwaway demo key,
		// not the prod pin; serve the demo pubkey at /public.key so the background
		// engine boot verifies cleanly. See vite.config demoPubkeyOverrideForE2E.
		env: { AMLFILTER_E2E_DEMO_PUBKEY: "1" },
	},
});
