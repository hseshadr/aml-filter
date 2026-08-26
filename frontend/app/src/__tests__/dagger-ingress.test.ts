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

	it("uses only pinned checkout and Dagger actions", () => {
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
					/^(actions\/checkout|dagger\/dagger-for-github)@/.test(ref ?? ""),
				),
			).toBe(true);
		}
	});

	it("disables persisted credentials on every checkout", () => {
		for (const file of workflows()) {
			const yaml = read(file);
			const checkouts = [...yaml.matchAll(/uses:\s*actions\/checkout@/g)]
				.length;
			const disabled = [...yaml.matchAll(/persist-credentials:\s*false/g)]
				.length;
			expect(disabled, file).toBe(checkouts);
		}
	});

	it("exposes the sole PR and push gate as exact Dagger", () => {
		const eventIngress = workflows().filter((file) =>
			/^ {2}(?:push|pull_request):/m.test(read(file)),
		);
		expect(eventIngress).toEqual(["dagger.yml"]);
		expect(read("dagger.yml")).toMatch(
			/jobs:\n {2}checks:\n {4}name: Dagger\n/,
		);
		expect(read("dagger.yml")).not.toContain("Canonical checks");
	});

	it("runs freshness entirely inside a fail-closed Dagger entrypoint", () => {
		const yaml = read("watchlist-freshness.yml");
		expect(yaml).toContain("permissions:\n  contents: read\n");
		expect(yaml).toContain("call: freshness sync");
		expect(yaml).not.toMatch(/issues:\s*write/);
		expect(yaml).not.toContain("actions/github-script");
		expect(yaml).not.toContain("BREACHED=");
	});

	it("serializes every production upload through one mutex", () => {
		for (const file of ["dagger.yml", "publish-watchlist.yml"]) {
			expect(read(file)).toContain("group: deploy-aml-filter-com");
			expect(read(file)).toContain("cancel-in-progress: false");
		}
	});
});
