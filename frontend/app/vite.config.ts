/// <reference types="vitest/config" />
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { configDefaults } from "vitest/config";

// DEV-ONLY: serve the staged onnxruntime-web runtime under /ort/ as raw files.
// In production /ort/ is plain static output and its loader module dynamic-
// imports cleanly, but the dev server routes .mjs requests through the module
// pipeline and refuses to import files that live in public/ ("can only be
// referenced via HTML tags"). Serving them raw here keeps dev === prod: the
// embedder's `wasmPaths = "/ort/"` works on the dev server too, so even local
// dev never touches the jsDelivr CDN (house standard §8.1b).
function serveOrtRuntimeRawInDev(): Plugin {
	const publicDir = join(dirname(fileURLToPath(import.meta.url)), "public");
	const mime: Record<string, string> = {
		".mjs": "text/javascript",
		".wasm": "application/wasm",
	};
	return {
		name: "amlfilter:serve-ort-runtime-raw",
		apply: "serve",
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const path = (req.url ?? "").split("?")[0];
				const ext = Object.keys(mime).find((e) => path.endsWith(e));
				if (!path.startsWith("/ort/") || ext === undefined) {
					next();
					return;
				}
				readFile(join(publicDir, path)).then(
					(bytes) => {
						res.setHeader("Content-Type", mime[ext]);
						res.end(bytes);
					},
					() => next(),
				);
			});
		},
	};
}

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react(), serveOrtRuntimeRawInDev()],
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
	optimizeDeps: {
		// sqlite-wasm resolves its .wasm + helper assets relative to its own
		// module URL; esbuild pre-bundling breaks that resolution (official
		// @sqlite.org/sqlite-wasm guidance for Vite).
		exclude: ["@sqlite.org/sqlite-wasm"],
	},
	worker: {
		// The DB worker imports the sqlite-wasm ES module; classic-script
		// worker bundling cannot. The engine workers are already module
		// workers, so this is a no-op for them.
		format: "es",
	},
	server: {
		port: 5173,
	},
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/test/setup.ts"],
		// Playwright owns tests/ (e2e); keep Vitest to unit specs in src/.
		exclude: [...configDefaults.exclude, "tests/**"],
		// House standard §2 floors, enforced because the gate's test step runs with --coverage.
		coverage: {
			thresholds: { statements: 90, lines: 90, functions: 90, branches: 85 },
		},
	},
});
