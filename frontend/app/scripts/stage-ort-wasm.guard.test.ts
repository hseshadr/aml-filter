// The resolver-guard behavior of stage-ort-wasm.mjs, isolated in its own file
// because it stubs node:module's createRequire. (The main stage-ort-wasm suite
// runs against the real lockfile-pinned node_modules; this one forces the
// resolver to yield a path OUTSIDE node_modules — e.g. a bundler-inlined copy —
// so the package-root derivation must refuse loudly instead of silently staging
// bytes from a bogus root.)

import type { createRequire as CreateRequire } from "node:module";
import { sep } from "node:path";
import { describe, expect, it, vi } from "vitest";

const fakeCreateRequire = (() => ({
	resolve: () => `${sep}opt${sep}bundle${sep}onnxruntime-web.mjs`,
})) as unknown as typeof CreateRequire;

vi.mock(import("node:module"), async (importOriginal) => {
	const actual = await importOriginal();
	// node:module is CJS-backed: its ESM namespace carries a `default` object the
	// interop layer reads named imports from — override createRequire on both.
	const actualDefault =
		(actual as unknown as { default?: Record<string, unknown> }).default ?? {};
	return {
		...actual,
		createRequire: fakeCreateRequire,
		default: { ...actualDefault, createRequire: fakeCreateRequire },
	} as unknown as typeof actual;
});

describe("stage-ort-wasm resolver guard", () => {
	it("ortDistDir fails loudly when onnxruntime-web does not resolve from node_modules", async () => {
		const { ortDistDir } = await import("./stage-ort-wasm.mjs");
		expect(() => ortDistDir()).toThrow(
			/cannot locate onnxruntime-web package root/,
		);
	});
});
