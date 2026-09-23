import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// README contract — the portfolio README template, enforced inside `pnpm gate`.
//
// The first screen of the root README.md (title → tagline → badges → hero →
// "At a glance" → "Try it in 60 seconds") is written for a smart
// non-specialist, and it drifts the moment nobody checks it: a tagline edited in
// the README but not in package.json, a fifth badge, a renamed label, a dropped
// hero caption, a relative link to a file that moved. Deliberately dumb: string
// and regex checks only, no markdown parser — it guards shape, not prose.

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

const AT_A_GLANCE = "## At a glance";
const TRY_IT = "## Try it in 60 seconds";
const HOW_IT_WORKS = "## How it works";
const LABELS = [
	"**What it does**",
	"**Who it's for**",
	"**What stays on your device / what leaves it**",
	"**Runs on**",
	"**Not for**",
	"**Status**",
];

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

	it("shows at most four badges before 'At a glance'", () => {
		expect(at(AT_A_GLANCE)).toBeGreaterThan(0);
		const badges = readme.slice(0, at(AT_A_GLANCE)).split("[![").length - 1;
		expect(badges).toBeLessThanOrEqual(4);
	});

	it("puts every bolded At-a-glance label on the first screen", () => {
		const firstScreen = readme.slice(0, at(HOW_IT_WORKS));
		for (const label of LABELS) {
			expect(firstScreen, label).toContain(`- ${label} — `);
		}
	});

	it("orders hero caption, 'Try it in 60 seconds', then 'How it works'", () => {
		const caption = at("Real output of the example below");
		expect(caption).toBeGreaterThan(0);
		expect(at(TRY_IT)).toBeGreaterThan(caption);
		expect(at(HOW_IT_WORKS)).toBeGreaterThan(at(TRY_IT));
	});

	it("never claims the app works with no network", () => {
		// There is no service worker: list caching is not offline support.
		const firstScreen = readme.slice(0, at(HOW_IT_WORKS));
		expect(firstScreen).toContain("no offline mode");
		expect(readme).not.toMatch(/works offline|offline-capable|offline first/i);
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
