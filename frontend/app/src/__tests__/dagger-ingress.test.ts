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
const normalize = (value: string) => value.trim().replace(/\s+/g, " ");
const blockBetween = (
	yaml: string,
	startMarker: string,
	endMarker: string,
	label: string,
) => {
	const start = yaml.indexOf(startMarker);
	const body = yaml.slice(start + startMarker.length);
	const end = body.indexOf(endMarker);
	if (start < 0 || end < 0) throw new Error(`missing ${label}`);
	return normalize(body.slice(0, end));
};
const workflowTriggers = (yaml: string) =>
	blockBetween(yaml, "on:\n", "\npermissions:", "workflow triggers");
const workflowPermissions = (yaml: string) =>
	blockBetween(yaml, "permissions:\n", "\njobs:", "workflow permissions");
const jobDisplayName = (yaml: string, job: string) => {
	const name = yaml.match(
		new RegExp(`^  ${job}:\\n    name: ([^\\n]+)$`, "m"),
	)?.[1];
	if (name === undefined) throw new Error(`missing ${job} display name`);
	return name;
};
const actionInputs = (yaml: string, action: string) => {
	const actionStart = yaml.indexOf(`uses: ${action}@`);
	const nextStep = yaml.indexOf("\n      - ", actionStart);
	const step = yaml.slice(actionStart, nextStep < 0 ? undefined : nextStep);
	const withMarker = "\n        with:\n";
	const inputsStart = step.indexOf(withMarker);
	if (actionStart < 0 || inputsStart < 0)
		throw new Error(`missing ${action} inputs`);
	return normalize(step.slice(inputsStart + withMarker.length));
};
const deployAuthorization = (yaml: string) => {
	const marker = "    if: >-\n";
	const start = yaml.indexOf(marker);
	const body = yaml.slice(start + marker.length);
	const end = body.indexOf("\n    runs-on:");
	if (start < 0 || end < 0) throw new Error("missing deploy authorization");
	return normalize(body.slice(0, end));
};
const DEPLOY_SOURCE = `\${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || github.sha }}`;
const DEPLOY_AUTHORIZATION = [
	"(github.event_name == 'workflow_run' &&",
	"github.event.workflow_run.conclusion == 'success' &&",
	"github.event.workflow_run.event == 'push' &&",
	"github.event.workflow_run.head_branch == 'main' &&",
	"github.event.workflow_run.head_repository.full_name == github.repository) ||",
	"(github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main')",
].join(" ");
const DEPLOY_CHECKOUT_INPUTS = [
	"fetch-depth: 0",
	"persist-credentials: false",
	`ref: ${DEPLOY_SOURCE}`,
].join(" ");
const DEPLOY_DAGGER_INPUTS = [
	'version: "0.21.8"',
	"call: >-",
	"deploy",
	"--signing-key=env://WATCHLIST_SIGNING_KEY",
	"--cloudflare-api-token=env://CLOUDFLARE_API_TOKEN",
	"--cloudflare-account-id=env://CLOUDFLARE_ACCOUNT_ID",
	"--github-token=env://GITHUB_TOKEN",
	`--release-id=${DEPLOY_SOURCE}:\${{ github.run_id }}`,
].join(" ");
const CI_DAGGER_INPUTS = `version: "0.21.8" call: ci --commit-sha=\${{ github.sha }}`;
const CI_CHECKOUT_INPUTS = `fetch-depth: 0 persist-credentials: false ref: \${{ github.sha }}`;
const AUTHORIZER_TRIGGERS = "push: branches: [main] pull_request:";
const SECURITY_AUDIT_TRIGGERS =
	'schedule: - cron: "0 9 * * 1" workflow_dispatch:';
const READ_ONLY_PERMISSIONS = "contents: read";

describe("thin Dagger ingress", () => {
	it("keeps only the five orchestration entrypoints", () => {
		expect(workflows()).toEqual([
			"dagger.yml",
			"deploy.yml",
			"publish-watchlist.yml",
			"security-audit.yml",
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
		const yaml = read("dagger.yml");
		const eventIngress = workflows().filter((file) =>
			/^ {2}(?:push|pull_request):/m.test(read(file)),
		);
		expect(eventIngress).toEqual(["dagger.yml"]);
		expect(workflowTriggers(yaml)).toBe(AUTHORIZER_TRIGGERS);
		expect(workflowPermissions(yaml)).toBe(READ_ONLY_PERMISSIONS);
		expect(jobDisplayName(yaml, "checks")).toBe("Dagger");
		expect(yaml).not.toContain("Canonical checks");
	});

	it("keeps the authorizing Dagger workflow check-only", () => {
		const yaml = read("dagger.yml");
		expect(actionInputs(yaml, "actions/checkout")).toBe(CI_CHECKOUT_INPUTS);
		expect(actionInputs(yaml, "dagger/dagger-for-github")).toBe(
			CI_DAGGER_INPUTS,
		);
		expect(yaml).not.toContain("environment: production");
		expect(yaml).not.toContain("group: deploy-aml-filter-com");
		expect(yaml).not.toContain("secrets.");
	});

	it("isolates weekly and manual diagnostics from the Dagger authorizer", () => {
		const path = resolve(workflowDir, "security-audit.yml");
		expect(existsSync(path)).toBe(true);
		const yaml = read("security-audit.yml");
		expect(yaml.startsWith("name: Security audit\n")).toBe(true);
		expect(workflowTriggers(yaml)).toBe(SECURITY_AUDIT_TRIGGERS);
		expect(workflowPermissions(yaml)).toBe(READ_ONLY_PERMISSIONS);
		expect(jobDisplayName(yaml, "security")).toBe("Dagger security");
		expect(actionInputs(yaml, "actions/checkout")).toBe(CI_CHECKOUT_INPUTS);
		expect(actionInputs(yaml, "dagger/dagger-for-github")).toBe(
			CI_DAGGER_INPUTS,
		);
		expect(yaml).not.toMatch(/(?:secrets\.|environment:|^\s+env:)/m);
	});

	it.each(['  schedule:\n    - cron: "0 9 * * 1"\n', "  workflow_dispatch:\n"])(
		"rejects a non-push protected trigger",
		(injection) => {
			const mutated = read("dagger.yml").replace(
				"  pull_request:\n",
				`  pull_request:\n${injection}`,
			);
			expect(workflowTriggers(mutated)).not.toBe(AUTHORIZER_TRIGGERS);
		},
	);

	it("rejects the protected Dagger name on the diagnostic job", () => {
		const mutated = read("security-audit.yml").replace(
			"name: Dagger security",
			"name: Dagger",
		);
		expect(jobDisplayName(mutated, "security")).not.toBe("Dagger security");
	});

	it("deploys only from a strict completed Dagger run or main dispatch", () => {
		const yaml = read("deploy.yml");
		expect(yaml).toContain("workflow_run:");
		expect(yaml).toContain("workflow_dispatch:");
		expect(deployAuthorization(yaml)).toBe(DEPLOY_AUTHORIZATION);
	});

	it("checks out only the exact authorized deploy source", () => {
		expect(actionInputs(read("deploy.yml"), "actions/checkout")).toBe(
			DEPLOY_CHECKOUT_INPUTS,
		);
	});

	it("passes only the exact typed deploy inputs to Dagger", () => {
		expect(actionInputs(read("deploy.yml"), "dagger/dagger-for-github")).toBe(
			DEPLOY_DAGGER_INPUTS,
		);
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
		for (const file of ["deploy.yml", "publish-watchlist.yml"]) {
			expect(read(file)).toContain("group: deploy-aml-filter-com");
			expect(read(file)).toContain("cancel-in-progress: false");
		}
	});
});
