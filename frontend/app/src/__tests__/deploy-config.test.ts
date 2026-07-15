import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// These regressions silently break the Cloudflare Pages deploy if they
// re-appear, and neither units nor CI exercise the real Pages host:
//   1. Known SPA routes need HTML entrypoints, while unknown paths need a real 404.
//   2. A COEP header (`require-corp`) would block the cross-origin R2 bundle.
//   3. Without an explicit /models/* Cache-Control rule, Pages serves the 23 MB
//      SHA-256-pinned model with `max-age=0, must-revalidate`, so every visit
//      re-downloads it in full.
// This guard locks all three at the source files Pages copies from public/.
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const publicDir = resolve(appDir, "public");
const repoDir = resolve(appDir, "..", "..");

/**
 * Parse the Cloudflare Pages `_headers` grammar: an unindented non-comment line
 * starts a URL-pattern block; each following indented `Name: Value` line is one
 * response header for that pattern.
 */
function headerRules(text: string): Map<string, string[]> {
	const rules = new Map<string, string[]>();
	let pattern: string | undefined;
	for (const line of text.split("\n")) {
		if (!line.trim() || line.trimStart().startsWith("#")) {
			continue;
		}
		if (/^\S/.test(line)) {
			pattern = line.trim();
			rules.set(pattern, []);
		} else if (pattern !== undefined) {
			rules.get(pattern)?.push(line.trim());
		}
	}
	return rules;
}

describe("Cloudflare Pages deploy config", () => {
	it("ships explicit SPA entries and a custom 404 without a catch-all rewrite", () => {
		const redirects = readFileSync(resolve(publicDir, "_redirects"), "utf8");
		const activeRedirects = redirects
			.split("\n")
			.filter((line) => line.trim() && !line.trimStart().startsWith("#"));

		expect(activeRedirects).not.toContain("/* /index.html 200");
		for (const route of ["screen", "customers", "review", "settings"]) {
			expect(readFileSync(resolve(appDir, `${route}.html`), "utf8")).toContain(
				"/src/main.tsx",
			);
		}
		expect(readFileSync(resolve(publicDir, "404.html"), "utf8")).toContain(
			'content="noindex, nofollow"',
		);
	});

	it("does NOT set Cross-Origin-Embedder-Policy in _headers", () => {
		const headers = readFileSync(resolve(publicDir, "_headers"), "utf8");
		// Match only an active (non-comment) header directive, not the explanatory note.
		const hasActiveCoep = headers
			.split("\n")
			.filter((line) => !line.trimStart().startsWith("#"))
			.some((line) => /^\s*Cross-Origin-Embedder-Policy\s*:/i.test(line));
		expect(hasActiveCoep).toBe(false);
	});

	it("caches the pinned self-hosted model immutably via a /models/* rule", () => {
		const rules = headerRules(
			readFileSync(resolve(publicDir, "_headers"), "utf8"),
		);
		// The weights never change in place (SHA-256-pinned by download-model.mjs),
		// so a year-long immutable cache is safe and stops the 23 MB re-download
		// that Pages' default `max-age=0, must-revalidate` forces on every visit.
		expect(rules.get("/models/*")).toContain(
			"Cache-Control: public, max-age=31536000, immutable",
		);
	});

	it("keeps the baseline security headers on all paths", () => {
		const rules = headerRules(
			readFileSync(resolve(publicDir, "_headers"), "utf8"),
		);
		// Pages applies every matching block, so the /models/* rule must extend the
		// catch-all security block, never replace it.
		expect(rules.get("/*")).toContain("X-Frame-Options: DENY");
		expect(rules.get("/*")).toContain("X-Content-Type-Options: nosniff");
	});

	it("ships a worker/WASM-safe CSP without broad script or network escape hatches", () => {
		const rules = headerRules(
			readFileSync(resolve(publicDir, "_headers"), "utf8"),
		);
		const csp = rules
			.get("/*")
			?.find((header) => header.startsWith("Content-Security-Policy:"));

		expect(csp).toContain("default-src 'self'");
		expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
		expect(csp).toContain("worker-src 'self' blob:");
		expect(csp).toContain("connect-src 'self'");
		expect(csp).toContain("object-src 'none'");
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).not.toContain("'unsafe-eval'");
		expect(csp).not.toContain("'unsafe-inline'");
		expect(csp).not.toContain("https:");
	});

	it("keeps the JSON-LD integrity hash synchronized with the CSP", () => {
		const rules = headerRules(
			readFileSync(resolve(publicDir, "_headers"), "utf8"),
		);
		const csp = rules
			.get("/*")
			?.find((header) => header.startsWith("Content-Security-Policy:"));
		const html = readFileSync(resolve(appDir, "index.html"), "utf8");
		const jsonLd = html.match(
			/<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
		)?.[1];

		expect(jsonLd).toBeDefined();
		const hash = createHash("sha256")
			.update(jsonLd ?? "")
			.digest("base64");
		expect(csp).toContain(`'sha256-${hash}'`);
	});

	it("keeps React markup compatible with style-src self", () => {
		const layout = readFileSync(
			resolve(appDir, "src/components/Layout.tsx"),
			"utf8",
		);
		expect(layout).not.toContain("style={{");
	});

	it("needs no cross-origin data access in the same-origin production contract", () => {
		const headers = readFileSync(resolve(publicDir, "_headers"), "utf8");
		const activeHeaders = headers
			.split("\n")
			.filter((line) => !line.trimStart().startsWith("#"));
		expect(activeHeaders.join("\n")).not.toMatch(
			/Access-Control-Allow-Origin\s*:/i,
		);
	});

	it("serves trust metadata with explicit MIME and cache semantics", () => {
		const rules = headerRules(
			readFileSync(resolve(publicDir, "_headers"), "utf8"),
		);
		expect(rules.get("/public.key")).toContain(
			"Content-Type: application/octet-stream",
		);
		expect(rules.get("/public.key")).toContain(
			"Cache-Control: no-cache, must-revalidate",
		);
		expect(rules.get("/bundle/origin/latest")).toContain(
			"Cache-Control: no-store",
		);
		expect(rules.get("/build.json")).toEqual([
			"Cache-Control: no-store",
			"Content-Type: application/json; charset=utf-8",
		]);
		for (const pattern of [
			"/bundle/origin/manifest/*",
			"/bundle/origin/chunk/*",
		]) {
			expect(rules.get(pattern)).toContain(
				"Cache-Control: public, max-age=31536000, immutable",
			);
		}
	});

	it("publishes and verifies a repository-wide monotonic workflow sequence", () => {
		const deploy = readFileSync(
			resolve(repoDir, ".github/workflows/deploy.yml"),
			"utf8",
		);
		const nightly = readFileSync(
			resolve(repoDir, ".github/workflows/publish-watchlist.yml"),
			"utf8",
		);
		for (const workflow of [deploy, nightly]) {
			expect(workflow).toContain(
				'SEQUENCE="$((GITHUB_RUN_ID * 1000 + GITHUB_RUN_ATTEMPT))"',
			);
			expect(workflow).toContain('--sequence "$SEQUENCE"');
			expect(workflow).toContain("verify-published-origin");
			expect(workflow).toContain('--expect-sequence "$SEQUENCE"');
		}
	});

	it("stamps and verifies the exact deployed commit so a no-op cannot pass", () => {
		for (const workflow of ["deploy.yml", "publish-watchlist.yml"]) {
			const yaml = readFileSync(
				resolve(repoDir, ".github/workflows", workflow),
				"utf8",
			);
			expect(yaml).toContain("build-identity.mjs stamp");
			expect(yaml).toContain("build-identity.mjs verify");
			expect(yaml).toContain("https://aml-filter.com/build.json");
			expect(yaml).toContain('DEPLOY_SHA="$(git rev-parse HEAD)"');
		}
	});
});
