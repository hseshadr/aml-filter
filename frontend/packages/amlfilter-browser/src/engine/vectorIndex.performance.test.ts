import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { VectorIndex } from "./vectorIndex";

// Northstar retrieval budget, fixed before measurement:
// - workload: the observed real-list directory size (31,348) at production dim 384
// - memory: the row-major matrix must fit below 50 MiB
// - latency: exact top-10 retrieval p50 <= 500 ms and p95 <= 1,000 ms over 20
//   warm runs on the CI Node runner. Browser end-to-end separately budgets model
//   embedding + UI latency; this isolates the O(n*d) index scan that scales with data.
const ENTITY_COUNT = 31_348;
const DIMENSION = 384;
const RUNS = 20;
const MATRIX_BUDGET_BYTES = 50 * 1024 * 1024;
const P50_BUDGET_MS = 500;
const P95_BUDGET_MS = 1_000;
// Coverage instrumentation and constrained CI runners add setup time around
// the measured hot loop. Keep the product budgets above strict; this only
// prevents the harness's generic 5s timeout from masking a valid measurement.
const TEST_HARNESS_TIMEOUT_MS = 15_000;

function percentile(
	samples: readonly number[],
	percentileRank: number,
): number {
	const ordered = [...samples].sort((a, b) => a - b);
	const index = Math.max(0, Math.ceil(ordered.length * percentileRank) - 1);
	return ordered[index] ?? Number.POSITIVE_INFINITY;
}

function realisticIndex(): VectorIndex {
	const matrix = new Float32Array(ENTITY_COUNT * DIMENSION);
	const ids = Array.from({ length: ENTITY_COUNT }, (_, row) => `ENTITY:${row}`);
	for (let row = 0; row < ENTITY_COUNT; row += 1) {
		// Unit-length, deterministic rows keep cosine semantics realistic without
		// spending the test budget generating 12 million pseudorandom values.
		matrix[row * DIMENSION + (row % DIMENSION)] = 1;
	}
	expect(matrix.byteLength).toBeLessThanOrEqual(MATRIX_BUDGET_BYTES);
	return new VectorIndex(matrix, ids, DIMENSION);
}

describe("VectorIndex realistic performance contract", () => {
	it(
		"keeps 31,348 x 384 exact retrieval within fixed p50/p95 budgets",
		() => {
			const index = realisticIndex();
			const query = new Float32Array(DIMENSION).fill(1 / Math.sqrt(DIMENSION));
			index.search(query, 10);

			const samples: number[] = [];
			for (let run = 0; run < RUNS; run += 1) {
				const startedAt = performance.now();
				const hits = index.search(query, 10);
				samples.push(performance.now() - startedAt);
				expect(hits).toHaveLength(10);
			}

			const p50 = percentile(samples, 0.5);
			const p95 = percentile(samples, 0.95);
			console.info(
				`northstar-vector-search entities=${ENTITY_COUNT} dim=${DIMENSION} p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms matrix=${String(ENTITY_COUNT * DIMENSION * 4)}B`,
			);
			expect(p50).toBeLessThanOrEqual(P50_BUDGET_MS);
			expect(p95).toBeLessThanOrEqual(P95_BUDGET_MS);
		},
		TEST_HARNESS_TIMEOUT_MS,
	);
});
