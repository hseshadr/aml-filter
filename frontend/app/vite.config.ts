/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { configDefaults } from "vitest/config";
import { resolveOrtAsset } from "./src/dev/ortDevAsset";
import { cspFromHeadersFile } from "./src/dev/previewHeaders";

const APP_ROOT = dirname(fileURLToPath(import.meta.url));

// DEV-ONLY: serve the staged onnxruntime-web runtime under /ort/ as raw files.
// In production /ort/ is plain static output and its loader module dynamic-
// imports cleanly, but the dev server routes .mjs requests through the module
// pipeline and refuses to import files that live in public/ ("can only be
// referenced via HTML tags"). Serving them raw here keeps dev === prod: the
// embedder's `wasmPaths = "/ort/"` works on the dev server too, so even local
// dev never touches the jsDelivr CDN (house standard §8.1b). The request path is
// run through resolveOrtAsset, which rejects anything that escapes the staged
// /ort dir via `..` traversal (unit-tested in src/dev/ortDevAsset.test.ts).
function serveOrtRuntimeRawInDev(): Plugin {
	const publicDir = join(APP_ROOT, "public");
	return {
		name: "amlfilter:serve-ort-runtime-raw",
		apply: "serve",
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const urlPath = (req.url ?? "").split("?")[0];
				const asset = resolveOrtAsset(publicDir, urlPath);
				if (asset === null) {
					next();
					return;
				}
				readFile(asset.file).then(
					(bytes) => {
						res.setHeader("Content-Type", asset.contentType);
						res.end(bytes);
					},
					() => next(),
				);
			});
		},
	};
}

// Preview fidelity: Cloudflare Pages applies public/_headers in production,
// but plain `vite preview` serves no CSP. Reusing the actual catch-all policy
// makes every minified production E2E lane exercise the same network and
// WebAssembly restrictions as the deployed site. This is preview-only;
// `vite dev` needs its own inline React-refresh allowances.
function previewProdCspPlugin(): Plugin {
	return {
		name: "amlfilter:preview-prod-csp",
		configurePreviewServer(server) {
			const csp = cspFromHeadersFile(
				readFileSync(join(APP_ROOT, "public/_headers"), "utf8"),
			);
			server.middlewares.use((_req, res, next) => {
				res.setHeader("Content-Security-Policy", csp);
				next();
			});
		},
	};
}

// TEST-ONLY (rotation): the committed demo bundle under public/bundle/origin is
// signed with the THROWAWAY demo key, deliberately DIFFERENT from the committed
// production trust root public/public.key. Local browser lanes (vite dev AND
// preview) serve that committed demo bundle, so the in-tab verifier must check it
// against the DEMO public key, not the prod pin. When AMLFILTER_E2E_DEMO_PUBKEY=1
// (set ONLY by the e2e webServer commands) serve fixtures/demo-public.key at
// /public.key. Production build/deploy never sets the flag: the deploy workflow
// rebuilds the bundle with the PROD key and serves the prod pin, so the served
// bundle and pin always match in production. Remove alongside the rotation bridge.
function demoPubkeyOverrideForE2E(): Plugin {
	const enabled = process.env.AMLFILTER_E2E_DEMO_PUBKEY === "1";
	const demoPubkey = join(
		APP_ROOT,
		"..",
		"packages",
		"amlfilter-publisher",
		"fixtures",
		"demo-public.key",
	);
	return {
		name: "amlfilter:e2e-demo-pubkey",
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				if (!enabled || (req.url ?? "").split("?")[0] !== "/public.key") {
					next();
					return;
				}
				res.setHeader("Content-Type", "application/octet-stream");
				res.end(readFileSync(demoPubkey));
			});
		},
		configurePreviewServer(server) {
			server.middlewares.use((req, res, next) => {
				if (!enabled || (req.url ?? "").split("?")[0] !== "/public.key") {
					next();
					return;
				}
				res.setHeader("Content-Type", "application/octet-stream");
				res.end(readFileSync(demoPubkey));
			});
		},
	};
}

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		serveOrtRuntimeRawInDev(),
		previewProdCspPlugin(),
		demoPubkeyOverrideForE2E(),
	],
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
		rolldownOptions: {
			input: {
				main: join(APP_ROOT, "index.html"),
				screen: join(APP_ROOT, "screen.html"),
				customers: join(APP_ROOT, "customers.html"),
				review: join(APP_ROOT, "review.html"),
				settings: join(APP_ROOT, "settings.html"),
			},
		},
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
		// Playwright owns tests/ (e2e). The build scripts in scripts/ are split by
		// runner, not by directory: the *.test.ts specs there are ordinary Vitest
		// unit tests and must run here, while the *.test.mjs files are node:test
		// contract suites run by `pnpm test:contract` (node --test). Vitest cannot
		// load those — it fails with `Cannot bundle Node.js built-in "node:test"` —
		// so exclude the .mjs contract files specifically. Excluding all of
		// scripts/** to dodge that error silently drops five real unit-test files.
		exclude: [...configDefaults.exclude, "tests/**", "scripts/**/*.test.mjs"],
		// House standard §2 floors, enforced because the gate's test step runs with --coverage.
		coverage: {
			thresholds: { statements: 90, lines: 90, functions: 90, branches: 85 },
		},
	},
});
