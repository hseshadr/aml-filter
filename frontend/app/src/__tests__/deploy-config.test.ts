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
});
