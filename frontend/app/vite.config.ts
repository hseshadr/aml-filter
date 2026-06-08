/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import { DEFAULT_API_BASE } from "./src/lib/apiBase";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react()],
	build: {
		// esbuild's default build target ('modules' ≈ es2020) downlevels native
		// class private fields (#load/#extract in the embedder) to a WeakMap-based
		// accessor. transformers.js's own minified worker hits that mis-compiled
		// path and throws `Ke(...).call is not a function` the instant the model
		// loads — only in the minified production build, which is why the Node and
		// dev-server paths never caught it. es2022 keeps native private fields, so
		// the accessor is emitted as a real `#field` and the worker boots. (Mirrors
		// edge-reco's app tsconfig target = es2023, where the identical embedder
		// works.)
		target: "es2022",
	},
	server: {
		port: 5173,
		proxy: {
			"/api": {
				target: DEFAULT_API_BASE,
				changeOrigin: true,
			},
		},
	},
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/test/setup.ts"],
		// Playwright owns tests/ (e2e); keep Vitest to unit specs in src/.
		exclude: [...configDefaults.exclude, "tests/**"],
	},
});
