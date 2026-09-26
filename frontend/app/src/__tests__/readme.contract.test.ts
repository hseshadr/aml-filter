import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// README contract, enforced inside `pnpm gate`.
//
// The README is written for a compliance person at a small company, not an
// engineer: what it is, the problem, a live "Try it" with a real sanctioned name,
// how it works in plain words, which lists, what it does not do, then how to run
// it. It drifts the moment nobody checks it: a tagline edited in the README but
// not in package.json, a section reordered, internal jargon creeping back in, a
// relative link to a file that moved. Deliberately dumb: string and regex checks
// only, no markdown parser. It guards shape and a few load-bearing facts, not prose.

const repoRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"..",
	"..",
);
const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");

/** The workspace root and the app both publish the tagline as their description. */
const PACKAGE_JSONS = ["frontend/package.json", "frontend/app/package.json"];

const TRY_IT = "## Try it";
const HOW_IT_WORKS = "## How it works";
const LISTS = "## Which lists, and how fresh";
const LIMITS = "## What it does not do";
const RUN_IT = "## Run it yourself";
const SECTION_ORDER = [TRY_IT, HOW_IT_WORKS, LISTS, LIMITS, RUN_IT];

/** Internal vocabulary and hype that make a README hard to read. */
const BANNED =
	/northstar|\bseams?\b|\blego\b|trust envelope|fail[- ]closed|production[- ]ready|blazing|\brobust\b|receipt/i;

const at = (needle: string): number => readme.indexOf(needle);

function description(path: string): string {
	const pkg = JSON.parse(readFileSync(resolve(repoRoot, path), "utf8")) as {
		description?: string;
	};
	return pkg.description ?? "";
}

/** The first non-empty line after the title that is not a badge or a comment. */
function tagline(): string | undefined {
	return readme
		.split("\n")
		.slice(1)
		.map((line) => line.trim())
		.find((l) => l !== "" && !l.startsWith("[![") && !l.startsWith("<!--"));
}

/** Every `](target)` link outside fenced code blocks. */
function linkTargets(): string[] {
	const prose = readme.replace(/^```[\s\S]*?^```/gm, "");
	return [...prose.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map(
		(m) => m[1] ?? "",
	);
}

const isExternal = (target: string): boolean =>
	/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#");

describe("README contract", () => {
	it("opens with '# <Name>' and a tagline equal to every package description", () => {
		expect(readme.split("\n")[0]).toMatch(/^# \S/);
		const line = tagline();
		expect(line?.length ?? 0).toBeGreaterThan(0);
		expect(line?.length ?? 0).toBeLessThanOrEqual(120);
		for (const path of PACKAGE_JSONS) {
			expect(description(path), path).toBe(line);
		}
	});

	it("shows at most two badges before 'Try it'", () => {
		expect(at(TRY_IT)).toBeGreaterThan(0);
		const badges = readme.slice(0, at(TRY_IT)).split("[![").length - 1;
		expect(badges).toBeLessThanOrEqual(2);
	});

	it("orders Try it, How it works, lists, limits, then Run it yourself", () => {
		const positions = SECTION_ORDER.map((heading) => at(heading));
		expect(positions.every((p) => p > 0)).toBe(true);
		expect([...positions].sort((x, y) => x - y)).toEqual(positions);
	});

	it("puts the live site and a real sanctioned name with its screenshot in 'Try it'", () => {
		const tryIt = readme.slice(at(TRY_IT), at(HOW_IT_WORKS));
		expect(tryIt).toContain("https://aml-filter.com/screen");
		expect(tryIt).toContain("`Vladimir Putin`");
		expect(tryIt).toContain("](docs/assets/screen-putin.png)");
	});

	it("says the search page checks only the US list", () => {
		// ScreenPage.tsx screens OFAC_SDN only; all four lists run on Customers.
		expect(readme).toContain("The search page checks only the US list (OFAC).");
	});

	it("never claims the app works with no network", () => {
		// There is no service worker: list caching is not offline support.
		const limits = readme.slice(at(LIMITS), at(RUN_IT));
		expect(limits).toContain("There is no offline mode.");
		expect(readme).not.toMatch(/works offline|offline-capable|offline first/i);
	});

	it("keeps internal jargon and hype out of the README", () => {
		expect(readme).not.toMatch(BANNED);
	});

	it("links the interactive architecture map, whose source exists", () => {
		expect(readme).toMatch(
			/\[\*{0,2}Explore the interactive architecture map[^\]]*\]\(docs\/architecture\/index\.html\)/,
		);
		expect(
			existsSync(
				resolve(repoRoot, "docs/architecture/runtime.architecture.json"),
			),
		).toBe(true);
	});

	it("resolves every relative link to a path in the repo", () => {
		const relative = linkTargets().filter((t) => !isExternal(t));
		expect(relative.length).toBeGreaterThan(0);
		const missing = relative.filter((target) => {
			const path = decodeURIComponent(target.split("#")[0] ?? "");
			return !existsSync(resolve(repoRoot, path));
		});
		expect(missing).toEqual([]);
	});
});
