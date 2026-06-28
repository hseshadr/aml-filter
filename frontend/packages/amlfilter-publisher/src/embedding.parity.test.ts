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
// every vector still matches the golden to within MAX_COS_DIST. Because it loads
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

// We compare by COSINE DISTANCE (1 - cosθ), not per-element max-abs. q8 ONNX
// inference is NOT bit-reproducible across platforms: the same name embedded on
// macOS arm64 (where this golden was generated) vs linux x64 (CI) differs by up to
// ~6e-3 in the worst single element — enough to break a tight per-element gate,
// yet that drift is sparse (a few elements), so its whole-vector cosine distance is
// orders of magnitude smaller. Measured separation (this machine):
//   same-platform q8 vs golden : cosine dist ~1.5e-11 (floor)
//   q8 -> fp32 dtype swap      : cosine dist ~7.2e-3 - 8.4e-3 (the drift we MUST catch)
// A 4e-3 ceiling sits ~1.8x under the fp32 signal yet far above any cross-platform
// q8 noise, so it catches a real model/dtype/export change without flaking in CI.
const MAX_COS_DIST = 4e-3;
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

/** Cosine distance (1 - cosine similarity) between a fresh vector and the golden.
 * Both are L2-normalized, so this measures how far they point apart in the shared
 * embedding space — the property that must hold for precomputed list vectors and
 * in-tab query vectors to be comparable. */
function cosineDistance(
	actual: Float32Array,
	golden: readonly number[],
): number {
	let dot = 0;
	let na = 0;
	let ng = 0;
	for (let i = 0; i < actual.length; i += 1) {
		const a = actual[i] ?? 0;
		const g = golden[i] ?? 0;
		dot += a * g;
		na += a * a;
		ng += g * g;
	}
	return 1 - dot / (Math.sqrt(na) * Math.sqrt(ng));
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
				expect(cosineDistance(actual, expected.vector)).toBeLessThan(
					MAX_COS_DIST,
				);
			},
			MODEL_LOAD_TIMEOUT_MS,
		);
	}
});
