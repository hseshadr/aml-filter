import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { NVMRC, nodeVersionVerdict } from "./check-node-version.mjs";

const run = promisify(execFile);
const SCRIPT = fileURLToPath(new URL("./check-node-version.mjs", import.meta.url));

test("accepts the exact version .nvmrc pins", () => {
	const verdict = nodeVersionVerdict("v22.13.0", "22.13.0\n");
	assert.equal(verdict.ok, true);
	assert.match(verdict.message, /22\.13\.0/);
});

test("tolerates a leading v and surrounding whitespace in .nvmrc", () => {
	assert.equal(nodeVersionVerdict("v22.13.0", "  v22.13.0  \n").ok, true);
	assert.equal(nodeVersionVerdict("v22.13.0", "22.13.0").ok, true);
});

test("rejects a different major — the skew that hid three broken tests", () => {
	const verdict = nodeVersionVerdict("v24.16.0", "22.13.0\n");
	assert.equal(verdict.ok, false);
	assert.match(verdict.message, /24\.16\.0/);
	assert.match(verdict.message, /22\.13\.0/);
});

test("rejects a same-major drift, because CI installs one exact build", () => {
	assert.equal(nodeVersionVerdict("v22.13.1", "22.13.0\n").ok, false);
	assert.equal(nodeVersionVerdict("v22.22.3", "22.13.0\n").ok, false);
});

test("a rejection tells the reader how to fix it", () => {
	const { message } = nodeVersionVerdict("v24.16.0", "22.13.0\n");
	assert.match(message, /nvm use/);
	assert.match(message, /\.nvmrc/);
});

test("refuses to pass when .nvmrc is empty rather than silently matching", () => {
	const verdict = nodeVersionVerdict("v22.13.0", "\n");
	assert.equal(verdict.ok, false);
	assert.match(verdict.message, /\.nvmrc/);
});

test("the committed .nvmrc pins a concrete three-part version", () => {
	const pinned = readFileSync(NVMRC, "utf8").trim();
	assert.match(pinned, /^v?\d+\.\d+\.\d+$/);
});

test("the CLI exit code matches the verdict for the running Node", async () => {
	const expected = nodeVersionVerdict(
		process.version,
		readFileSync(NVMRC, "utf8"),
	).ok;

	let code = 0;
	let output = "";
	try {
		const { stdout } = await run(process.execPath, [SCRIPT]);
		output = stdout;
	} catch (error) {
		code = error.code;
		output = `${error.stdout}${error.stderr}`;
	}

	assert.equal(code === 0, expected);
	assert.match(output, /\d+\.\d+\.\d+/);
});
