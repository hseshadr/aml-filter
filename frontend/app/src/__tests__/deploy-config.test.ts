import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// These two regressions silently break the Cloudflare Pages deploy if they
// re-appear, and neither units nor CI exercise the real Pages host:
//   1. Without the SPA catch-all, a deep-link refresh (e.g. /screen) 404s.
//   2. A COEP header (`require-corp`) would block the cross-origin R2 bundle.
// This guard locks both at the source files Pages copies from public/.
const publicDir = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"public",
);

describe("Cloudflare Pages deploy config", () => {
	it("ships the SPA catch-all rewrite in _redirects", () => {
		const redirects = readFileSync(resolve(publicDir, "_redirects"), "utf8");
		const hasCatchAll = redirects
			.split("\n")
			.filter((line) => !line.trimStart().startsWith("#"))
			.some((line) => {
				const cols = line.trim().split(/\s+/);
				return (
					cols[0] === "/*" && cols[1] === "/index.html" && cols[2] === "200"
				);
			});
		expect(hasCatchAll).toBe(true);
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
