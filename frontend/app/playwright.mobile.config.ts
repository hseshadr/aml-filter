import { defineConfig, devices } from "@playwright/test";

/**
 * Mobile browser smoke gate over the minified production build. WebKit
 * approximates iPhone Safari's browser surface; Chromium uses the Pixel 5
 * Android profile plus a desktop control.
 */
const SPA_PORT = Number(process.env.E2E_MOBILE_SPA_PORT ?? 4178);

export default defineConfig({
	testDir: "./tests",
	testMatch: "**/mobile-workstation.spec.ts",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "line",
	use: {
		baseURL: `http://localhost:${SPA_PORT}`,
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
		command: `pnpm build && pnpm exec vite preview --port ${SPA_PORT} --strictPort`,
		url: `http://localhost:${SPA_PORT}/screen`,
		reuseExistingServer: !process.env.CI,
		timeout: 240_000,
		// No lane-only env: local preview pairs the committed demo bundle with its
		// demo verify key. The browser still exercises minified production assets.
	},
});
