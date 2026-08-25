import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const workflowDir = resolve(root, ".github/workflows");
const workflows = () =>
	readdirSync(workflowDir)
		.filter((file) => /\.ya?ml$/.test(file))
		.sort();
const read = (file: string) => readFileSync(resolve(workflowDir, file), "utf8");

describe("thin Dagger ingress", () => {
	it("keeps only the three orchestration entrypoints", () => {
		expect(workflows()).toEqual([
			"dagger.yml",
			"publish-watchlist.yml",
			"watchlist-freshness.yml",
		]);
	});

	it("preserves Dependabot as upstream PR authoring", () => {
		expect(existsSync(resolve(root, ".github/dependabot.yml"))).toBe(true);
	});

	it("runs no repository-authored shell outside Dagger", () => {
		for (const file of workflows()) {
			expect(read(file), file).not.toMatch(/^\s+run:/m);
		}
	});

	it("uses only checkout, Dagger, and the issue metadata projection", () => {
		for (const file of workflows()) {
			const refs = [...read(file).matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)].map(
				(match) => match[1],
			);
			expect(refs, file).toEqual(
				expect.arrayContaining([expect.stringMatching(/^actions\/checkout@/)]),
			);
			expect(refs, file).toEqual(
				expect.arrayContaining([
					expect.stringMatching(/^dagger\/dagger-for-github@/),
				]),
			);
			expect(
				refs.every((ref) =>
					/^(actions\/checkout|dagger\/dagger-for-github|actions\/github-script)@/.test(
						ref ?? "",
					),
				),
			).toBe(true);
		}
	});

	it("serializes every production upload through one mutex", () => {
		for (const file of ["dagger.yml", "publish-watchlist.yml"]) {
			expect(read(file)).toContain("group: deploy-aml-filter-com");
			expect(read(file)).toContain("cancel-in-progress: false");
		}
	});
});
