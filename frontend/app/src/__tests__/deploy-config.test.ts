import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// These regressions silently break the Cloudflare Pages deploy if they
// re-appear, and neither units nor CI exercise the real Pages host:
//   1. Known SPA routes need HTML entrypoints, while unknown paths need a real 404.
//   2. A COEP header (`require-corp`) would block the cross-origin R2 bundle.
// This guard locks both at the source files Pages copies from public/.
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const publicDir = resolve(appDir, "public");

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
});
