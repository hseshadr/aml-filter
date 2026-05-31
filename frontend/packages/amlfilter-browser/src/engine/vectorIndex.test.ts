import { describe, expect, it } from "vitest";
import { stagedIndex, stagedState } from "./fixtures";
import { FaissParseError, loadVectorIndex } from "./vectorIndex";

const DIM = 384;

/** The exact-hit direction the fixture producer used for e_ivanov (seed=1.0). */
function exactHitVector(): Float32Array {
	const v = new Float32Array(DIM);
	v[0] = 1;
	return v;
}

describe("loadVectorIndex parses the producer's FAISS IndexFlatIP", () => {
	it("reads ntotal, dim, and the faiss_ids row map", () => {
		const index = loadVectorIndex({
			index: stagedIndex(),
			state: stagedState(),
		});
		expect(index.dim).toBe(DIM);
		expect(index.ntotal).toBe(3);
		expect(index.idAt(0)).toBe("e_ivanov");
		expect(index.idAt(1)).toBe("e_petrov");
		expect(index.idAt(2)).toBe("e_acme");
	});

	it("cosine-ranks the exact-hit entity first with similarity ~1.0", () => {
		const index = loadVectorIndex({
			index: stagedIndex(),
			state: stagedState(),
		});
		const hits = index.search(exactHitVector(), 3);
		expect(hits[0]?.id).toBe("e_ivanov");
		expect(hits[0]?.score).toBeCloseTo(1.0, 5);
		// e_acme (seed=0.2) is the least aligned with the [1,0,...] direction.
		expect(hits[2]?.id).toBe("e_acme");
		expect(hits[0]?.score).toBeGreaterThan(hits[2]?.score ?? 1);
	});

	it("rejects a non-flat FAISS header (fail-closed)", () => {
		const bad = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
		expect(() => loadVectorIndex({ index: bad, state: stagedState() })).toThrow(
			FaissParseError,
		);
	});

	it("rejects a query of the wrong dimension", () => {
		const index = loadVectorIndex({
			index: stagedIndex(),
			state: stagedState(),
		});
		expect(() => index.search(new Float32Array(8), 3)).toThrow();
	});
});
