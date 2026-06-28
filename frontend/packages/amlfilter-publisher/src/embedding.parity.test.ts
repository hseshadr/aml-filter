// Node-embedding drift guard: the publisher precomputes watchlist name vectors in
// Node (createNodeEmbedder over transformers.js MiniLM), and the browser embeds
// the query name in-tab. Both MUST live in the SAME 384-d space, so a silent
// Node-side embedding change (a dtype/model swap, an onnxruntime upgrade that
// shifts quantized outputs) would desync precomputed list vectors from in-tab
// query vectors — without ever failing a fake-embedder unit test.
//
// This mirrors the scoring parity guard: the golden under __fixtures__/embedding
// is a FROZEN, committed snapshot of the REAL Node embedder's output over a small
// set of fixed reference names. The test re-runs the real embedder and asserts
// every vector still matches the golden to within MAX_ABS_DIFF. Because it loads
// the ~23 MB MiniLM weights, it is heavier than the fake-embedder tests and is
// guarded to SKIP (loudly) when those weights are absent — in CI they are present
// before `pnpm -r run test`, so the guard runs there.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMBEDDING_DIM } from "@amlfilter/browser";
import { describe, expect, it } from "vitest";
import { createNodeEmbedder } from "./nodeEmbedder.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
// The dir that CONTAINS the `Xenova/all-MiniLM-L6-v2/...` layout.
const MODELS = resolve(HERE, "../../../app/public/models");
const WEIGHTS_DIR = resolve(MODELS, "Xenova/all-MiniLM-L6-v2");
const GOLDEN = resolve(HERE, "__fixtures__/embedding/golden.json");

// ~5 fixed representative reference names — a plain person name, an org/"bank"
// name, an accented name with an honorific, a transliterated name, and a short
// single token. These MUST stay identical to the names in the committed golden.
const REFERENCE_NAMES = [
	"Ivan Petrov",
	"Bank Rossiya",
	"Señor José Hernández",
	"Mohammed al-Hassan",
	"Kim",
] as const;

// Browser↔Node embedding parity is asserted at ~1e-3 elsewhere; the same-runtime
// drift this guard catches should be far tighter, so 1e-3 is a generous ceiling.
const MAX_ABS_DIFF = 1e-3;
// The first embed pays the one-time ~23 MB weight load + ONNX compile.
const MODEL_LOAD_TIMEOUT_MS = 120_000;

/** One frozen reference vector in the committed golden. */
interface GoldenVector {
	readonly name: string;
	readonly vector: readonly number[];
}

const weightsPresent = existsSync(WEIGHTS_DIR);
if (!weightsPresent) {
	console.warn(
		`[embedding.parity] SKIPPING the Node-embedding drift guard: MiniLM weights ` +
			`are absent at ${WEIGHTS_DIR}. In CI the weights are restored before ` +
			`\`pnpm -r run test\`, so the guard runs there; to exercise it locally, run ` +
			`the app prebuild (which downloads the weights).`,
	);
}

function loadGolden(): readonly GoldenVector[] {
	return JSON.parse(readFileSync(GOLDEN, "utf-8")) as GoldenVector[];
}

/** Max absolute element-wise difference between a fresh vector and the golden. */
function maxAbsDiff(actual: Float32Array, golden: readonly number[]): number {
	let max = 0;
	for (let i = 0; i < actual.length; i += 1) {
		const diff = Math.abs(
			(actual[i] ?? Number.NaN) - (golden[i] ?? Number.NaN),
		);
		if (diff > max) {
			max = diff;
		}
	}
	return max;
}

describe("Node embedding parity — createNodeEmbedder reproduces the frozen golden", () => {
	const golden = loadGolden();
	// One warm embedder, shared across cases: the weights load lazily on first embed.
	const embedder = createNodeEmbedder(MODELS);

	for (const name of REFERENCE_NAMES) {
		it.skipIf(!weightsPresent)(
			name,
			async () => {
				const expected = golden.find((g) => g.name === name);
				expect(expected).toBeDefined();
				if (expected === undefined) {
					return;
				}
				expect(expected.vector.length).toBe(EMBEDDING_DIM);

				const actual = await embedder.embed(name);
				expect(actual.length).toBe(EMBEDDING_DIM);
				expect(maxAbsDiff(actual, expected.vector)).toBeLessThan(MAX_ABS_DIFF);
			},
			MODEL_LOAD_TIMEOUT_MS,
		);
	}
});
