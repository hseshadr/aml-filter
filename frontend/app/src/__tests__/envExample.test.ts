import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	BOOT_TIMEOUT_MS,
	MODEL_LOAD_IDLE_TIMEOUT_MS,
} from "@amlfilter/browser";
import { describe, expect, it } from "vitest";

// Env-docs drift gate. `.env.example` is the operator-facing list of build-time
// Vite vars; `vite-env.d.ts` is the typed list the code reads. They drifted once:
// the example named `VITE_MODEL_LOAD_TIMEOUT_MS` (120000) and a 180000 boot
// ceiling long after the code moved to `VITE_MODEL_LOAD_IDLE_TIMEOUT_MS`
// (90000) and `BOOT_TIMEOUT_MS` (900000). This pins both the names and the
// documented defaults to the engine's real constants.

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const envExample = readFileSync(join(APP_DIR, ".env.example"), "utf8");
const viteEnv = readFileSync(join(APP_DIR, "src", "vite-env.d.ts"), "utf8");

/** `# VITE_FOO=123` (commented or not) → { VITE_FOO: "123" }. */
function exampleVars(text: string): Map<string, string> {
	const vars = new Map<string, string>();
	for (const match of text.matchAll(/^#?\s*(VITE_[A-Z0-9_]+)=(\S*)$/gm)) {
		vars.set(match[1] ?? "", match[2] ?? "");
	}
	return vars;
}

function declaredVars(text: string): string[] {
	return [...text.matchAll(/readonly\s+(VITE_[A-Z0-9_]+)\??:/g)]
		.map((match) => match[1] ?? "")
		.sort();
}

describe(".env.example matches the env vars the code reads", () => {
	const vars = exampleVars(envExample);

	it("names exactly the VITE_ vars declared in vite-env.d.ts", () => {
		expect([...vars.keys()].sort()).toEqual(declaredVars(viteEnv));
	});

	it("documents the engine's real model-load idle default", () => {
		expect(Number(vars.get("VITE_MODEL_LOAD_IDLE_TIMEOUT_MS"))).toBe(
			MODEL_LOAD_IDLE_TIMEOUT_MS,
		);
	});

	it("documents the engine's real whole-boot ceiling", () => {
		expect(Number(vars.get("VITE_BOOT_TIMEOUT_MS"))).toBe(BOOT_TIMEOUT_MS);
	});
});
