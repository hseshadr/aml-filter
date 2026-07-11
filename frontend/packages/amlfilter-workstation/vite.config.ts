/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// Vitest-only config: the package is consumed as TS source by the app's Vite
// build. DB tests run in a NODE environment against the official sqlite-wasm
// build opened in-memory; the opfs-sahpool VFS is browser/worker-only and is
// covered by the Playwright e2e instead.
export default defineConfig({
	test: {
		environment: "node",
		globals: false,
		// House standard §2 floors, enforced because the gate's test step runs
		// with --coverage.
		coverage: {
			thresholds: { statements: 90, lines: 90, functions: 90, branches: 85 },
		},
	},
});
