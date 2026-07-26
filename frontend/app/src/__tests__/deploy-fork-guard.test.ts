import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The deploy trigger must reject a FORK's pull request, not merely a branch NAME.
//
// `workflow_run` fires in the BASE repository, with the base repository's secrets.
// Its `head_branch` is attacker-controlled: a fork's default branch is also called
// `main`, and a fork-PR run reports that name here. So a gate that checks only
// `head_branch == 'main'` admits any outside contributor's PR — and the deploy job
// then checks out `workflow_run.head_sha` and runs `pnpm install` plus the build
// with WATCHLIST_SIGNING_KEY and CLOUDFLARE_API_TOKEN in scope. A lifecycle script
// in the fork-authored lockfile is arbitrary code holding the production sanctions
// signing key.
//
// These tests evaluate the ACTUAL `if:` expression committed in
// .github/workflows/deploy.yml against synthesized event payloads, in BOTH
// polarities: a legitimate push to this repo's `main` must be ACCEPTED, and a fork
// pull request claiming `main` must be REJECTED. The `pre-fix guard` case replays
// the expression this guard replaced against the same hostile payload and asserts
// it was ACCEPTED — proof that these cases measure the property, not the shape.

const repoRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"..",
	"..",
);
const deployWorkflow = resolve(repoRoot, ".github", "workflows", "deploy.yml");

const GUARDED_JOB = "preflight";
const THIS_REPO = "hseshadr/aml-filter";
const FORK_REPO = "attacker/aml-filter";

/** The gate this one replaced, verbatim — so the hostile payload can be shown ACCEPTED by it. */
const PRE_FIX_GUARD =
	"github.event_name == 'workflow_dispatch' || " +
	"(github.event.workflow_run.conclusion == 'success' && " +
	"github.event.workflow_run.head_branch == 'main')";

const TOKEN = /\(|\)|\|\||&&|==|!=|'[^']*'|[A-Za-z_][A-Za-z0-9_.]*/g;
const RUN_PREFIX = "github.event.workflow_run.";
const BLOCK_MARKERS = new Set([">-", ">", ">+", "|-", "|", "|+"]);
const IF_KEY = "    if:";

/** The attacker-visible fields of a `workflow_run` payload. */
type WorkflowRun = {
	readonly event: string;
	readonly conclusion: string;
	readonly headBranch: string;
	readonly headRepositoryFullName: string;
};

/** The `github` context a job-level `if:` is evaluated against. */
type Context = {
	readonly eventName: string;
	readonly repository: string;
	readonly workflowRun?: WorkflowRun;
};

type Value = string | boolean | null;

function runField(run: WorkflowRun, field: string): string {
	if (field === "event") return run.event;
	if (field === "conclusion") return run.conclusion;
	if (field === "head_branch") return run.headBranch;
	if (field === "head_repository.full_name") return run.headRepositoryFullName;
	throw new Error(`unmodelled workflow_run field: ${field}`);
}

/** Look up a dotted path. An unmodelled path throws instead of vanishing to null. */
function resolvePath(context: Context, path: string): Value {
	if (path === "github.event_name") return context.eventName;
	if (path === "github.repository") return context.repository;
	if (!path.startsWith(RUN_PREFIX)) {
		throw new Error(`unmodelled context path: ${path}`);
	}
	const run = context.workflowRun;
	return run === undefined
		? null
		: runField(run, path.slice(RUN_PREFIX.length));
}

/** GitHub coerces to boolean: null is false, a non-empty string is true. */
function truthy(value: Value): boolean {
	return Boolean(value);
}

/** Recursive-descent evaluator for the `|| && == !=` subset used by deploy.yml. */
class Evaluator {
	private readonly tokens: readonly string[];
	private readonly context: Context;
	private index = 0;

	constructor(expression: string, context: Context) {
		this.tokens = expression.match(TOKEN) ?? [];
		this.context = context;
	}

	run(): boolean {
		const value = this.orExpr();
		if (this.index !== this.tokens.length) {
			throw new Error(
				`trailing tokens: ${this.tokens.slice(this.index).join(" ")}`,
			);
		}
		return truthy(value);
	}

	private peek(): string | undefined {
		return this.tokens[this.index];
	}

	private take(): string {
		const lexeme = this.tokens[this.index];
		if (lexeme === undefined) throw new Error("expression ended early");
		this.index += 1;
		return lexeme;
	}

	private orExpr(): boolean {
		let result = truthy(this.andExpr());
		while (this.peek() === "||") {
			this.take();
			result = truthy(this.andExpr()) || result;
		}
		return result;
	}

	private andExpr(): boolean {
		let result = truthy(this.compare());
		while (this.peek() === "&&") {
			this.take();
			result = truthy(this.compare()) && result;
		}
		return result;
	}

	private compare(): Value {
		const left = this.atom();
		const operator = this.peek();
		if (operator !== "==" && operator !== "!=") return left;
		this.take();
		const right = this.atom();
		return operator === "==" ? left === right : left !== right;
	}

	private atom(): Value {
		const lexeme = this.take();
		if (lexeme === "(") {
			const value = this.orExpr();
			if (this.take() !== ")") throw new Error("unbalanced parenthesis");
			return value;
		}
		if (lexeme.startsWith("'")) return lexeme.slice(1, -1);
		return resolvePath(this.context, lexeme);
	}
}

/** Evaluate a GitHub Actions `if:` expression against a synthesized context. */
function evaluate(expression: string, context: Context): boolean {
	return new Evaluator(expression, context).run();
}

/** True for a two-space job key (`  deploy:`) — i.e. the end of the previous job. */
function isJobHeader(line: string): boolean {
	const stripped = line.trim();
	if (stripped === "" || stripped.startsWith("#")) return false;
	return line.startsWith("  ") && !line.startsWith("   ");
}

function jobLines(lines: readonly string[], job: string): readonly string[] {
	const start = lines.indexOf(`  ${job}:`);
	if (start === -1) throw new Error(`no job named ${job}`);
	const rest = lines.slice(start + 1);
	const end = rest.findIndex(isJobHeader);
	return end === -1 ? rest : rest.slice(0, end);
}

/** Join a folded block scalar the way YAML does: continuation lines, one space. */
function fold(marker: string, rest: readonly string[]): string {
	if (!BLOCK_MARKERS.has(marker)) return marker;
	const end = rest.findIndex(
		(line) => line.trim() !== "" && !line.startsWith("      "),
	);
	const body = end === -1 ? rest : rest.slice(0, end);
	return body
		.map((line) => line.trim())
		.filter((line) => line !== "")
		.join(" ");
}

/** Return the `if:` expression of `job` exactly as committed. */
function extractJobIf(workflow: string, job: string): string {
	const lines = jobLines(workflow.split("\n"), job);
	const index = lines.findIndex((line) => line.startsWith(IF_KEY));
	const line = lines[index];
	if (line === undefined) throw new Error(`job ${job} declares no if:`);
	return fold(line.slice(IF_KEY.length).trim(), lines.slice(index + 1));
}

const GUARD = extractJobIf(readFileSync(deployWorkflow, "utf8"), GUARDED_JOB);

/** The one payload that may deploy: a push to THIS repo's main whose CI passed. */
function pushToMain(): Context {
	return {
		eventName: "workflow_run",
		repository: THIS_REPO,
		workflowRun: {
			event: "push",
			conclusion: "success",
			headBranch: "main",
			headRepositoryFullName: THIS_REPO,
		},
	};
}

/** A fork PR. The fork's default branch is ALSO called `main` — that is the point. */
function forkPullRequest(event = "pull_request"): Context {
	return {
		eventName: "workflow_run",
		repository: THIS_REPO,
		workflowRun: {
			event,
			conclusion: "success",
			headBranch: "main",
			headRepositoryFullName: FORK_REPO,
		},
	};
}

describe("deploy auto-trigger fork guard", () => {
	it("reads the guard from the committed workflow (guards against a vacuous pass)", () => {
		expect(GUARD).toContain("head_repository.full_name == github.repository");
		expect(GUARD).toContain("github.event.workflow_run.event == 'push'");
	});

	it("ACCEPTS a legitimate push to this repo's main", () => {
		expect(evaluate(GUARD, pushToMain())).toBe(true);
	});

	it("REJECTS a fork pull request claiming main", () => {
		expect(evaluate(GUARD, forkPullRequest())).toBe(false);
	});

	it("REJECTS a fork run even when it reports event 'push'", () => {
		expect(evaluate(GUARD, forkPullRequest("push"))).toBe(false);
	});

	it("REJECTS a same-repo pull request", () => {
		const context: Context = {
			eventName: "workflow_run",
			repository: THIS_REPO,
			workflowRun: {
				event: "pull_request",
				conclusion: "success",
				headBranch: "main",
				headRepositoryFullName: THIS_REPO,
			},
		};
		expect(evaluate(GUARD, context)).toBe(false);
	});

	it("REJECTS a failed CI run on main", () => {
		const context: Context = {
			eventName: "workflow_run",
			repository: THIS_REPO,
			workflowRun: {
				event: "push",
				conclusion: "failure",
				headBranch: "main",
				headRepositoryFullName: THIS_REPO,
			},
		};
		expect(evaluate(GUARD, context)).toBe(false);
	});

	it("still ACCEPTS a manual workflow_dispatch", () => {
		const context: Context = {
			eventName: "workflow_dispatch",
			repository: THIS_REPO,
		};
		expect(evaluate(GUARD, context)).toBe(true);
	});

	it("pre-fix guard ACCEPTED the fork pull request the new one rejects", () => {
		// Break the property, not the form: the gate we replaced admits the attack.
		expect(evaluate(PRE_FIX_GUARD, forkPullRequest())).toBe(true);
		expect(evaluate(GUARD, forkPullRequest())).toBe(false);
	});
});

describe("expression evaluator", () => {
	const base: Context = { eventName: "push", repository: THIS_REPO };

	it.each([
		["'a' == 'a'", true],
		["'a' == 'b'", false],
		["'a' != 'b'", true],
		["'a' == 'b' || 'c' == 'c'", true],
		["'a' == 'b' && 'c' == 'c'", false],
		["('a' == 'b' || 'c' == 'c') && 'd' == 'd'", true],
		["'a' == 'b' || 'c' == 'c' && 'd' == 'e'", false],
	])("evaluates %s to %s", (expression, expected) => {
		expect(evaluate(expression, base)).toBe(expected);
	});

	it("resolves a missing workflow_run to null rather than a match", () => {
		const context: Context = {
			eventName: "workflow_dispatch",
			repository: THIS_REPO,
		};
		const expression = "github.event.workflow_run.conclusion == 'success'";
		expect(evaluate(expression, context)).toBe(false);
	});

	it("throws on an unmodelled context path instead of passing vacuously", () => {
		expect(() => evaluate("github.actor == 'x'", base)).toThrow(
			/unmodelled context path/,
		);
	});
});

describe("if: extractor", () => {
	const workflow = [
		"jobs:",
		"  preflight:",
		"    if: >-",
		"      a == 'x' &&",
		"      b == 'y'",
		"    outputs:",
		"      k: v",
		"  deploy:",
		"    if: always()",
		"",
	].join("\n");

	it("folds a block scalar and stops at the next job", () => {
		expect(extractJobIf(workflow, "preflight")).toBe("a == 'x' && b == 'y'");
		expect(extractJobIf(workflow, "deploy")).toBe("always()");
	});

	it("refuses a job that is not there", () => {
		expect(() => extractJobIf(workflow, "nope")).toThrow(/no job named/);
	});
});
