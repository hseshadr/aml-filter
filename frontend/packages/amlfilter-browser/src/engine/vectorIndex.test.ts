import { describe, expect, it } from "vitest";
import { VectorIndex } from "./vectorIndex";

const DIM = 384;

/** Three L2-normalized rows along distinct axes, in entity-id order. */
function fixtureIndex(): VectorIndex {
	const matrix = new Float32Array(3 * DIM);
	matrix[0 * DIM + 0] = 1; // e_ivanov along axis 0
	matrix[1 * DIM + 1] = 1; // e_petrov along axis 1
	matrix[2 * DIM + 2] = 1; // e_acme along axis 2
	return new VectorIndex(matrix, ["e_ivanov", "e_petrov", "e_acme"], DIM);
}

/** A query aligned with e_ivanov's axis (cosine 1.0). */
function exactHitVector(): Float32Array {
	const v = new Float32Array(DIM);
	v[0] = 1;
	return v;
}

describe("VectorIndex over the decoded watchlist vectors", () => {
	it("reports ntotal, dim, and the row->id map", () => {
		const index = fixtureIndex();
		expect(index.dim).toBe(DIM);
		expect(index.ntotal).toBe(3);
		expect(index.idAt(0)).toBe("e_ivanov");
		expect(index.idAt(1)).toBe("e_petrov");
		expect(index.idAt(2)).toBe("e_acme");
	});

	it("cosine-ranks the exact-hit entity first with similarity ~1.0", () => {
		const hits = fixtureIndex().search(exactHitVector(), 3);
		expect(hits[0]?.id).toBe("e_ivanov");
		expect(hits[0]?.score).toBeCloseTo(1.0, 5);
		// The orthogonal rows score ~0 — strictly below the exact hit.
		expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? 1);
	});

	it("normalizes a non-unit query before scoring", () => {
		const v = new Float32Array(DIM);
		v[0] = 5; // non-unit; cosine with the unit row is still 1.0
		expect(fixtureIndex().search(v, 1)[0]?.score).toBeCloseTo(1.0, 5);
	});

	it("rejects a matrix whose length disagrees with ids*dim (fail-closed)", () => {
		expect(() => new VectorIndex(new Float32Array(5), ["a"], DIM)).toThrow();
	});

	it("rejects a query of the wrong dimension", () => {
		expect(() => fixtureIndex().search(new Float32Array(8), 3)).toThrow();
	});

	it("idAt fails loudly for a row outside the index (no silent undefined)", () => {
		expect(() => fixtureIndex().idAt(999)).toThrow(RangeError);
		expect(() => fixtureIndex().idAt(999)).toThrow(/out of range/);
	});
});

// similarityOf backs union retrieval: a candidate that arrived from the lexical
// index still needs a REAL name_vector signal, not an invented one.
describe("VectorIndex.similarityOf — cosine for one known entity", () => {
	it("reports the same number search would have reported for that row", () => {
		const index = fixtureIndex();
		const hit = index.search(exactHitVector(), 1)[0];
		expect(index.similarityOf("e_ivanov", exactHitVector())).toBeCloseTo(
			hit?.score ?? Number.NaN,
			10,
		);
	});

	it("scores an entity the vector search never returned", () => {
		// e_acme is orthogonal to the query, so a top-1 search misses it entirely;
		// its honest cosine is still ~0 and must be computable.
		expect(fixtureIndex().similarityOf("e_acme", exactHitVector())).toBeCloseTo(
			0,
			5,
		);
	});

	it("normalizes a non-unit query, exactly as search does", () => {
		const v = new Float32Array(DIM);
		v[0] = 5;
		expect(fixtureIndex().similarityOf("e_ivanov", v)).toBeCloseTo(1.0, 5);
	});

	it("returns 0 for an all-zero query rather than dividing by zero", () => {
		expect(fixtureIndex().similarityOf("e_ivanov", new Float32Array(DIM))).toBe(
			0,
		);
	});

	it("THROWS for an entity id the index has never seen (no silent 0)", () => {
		expect(() =>
			fixtureIndex().similarityOf("e_nobody", exactHitVector()),
		).toThrow(RangeError);
		expect(() =>
			fixtureIndex().similarityOf("e_nobody", exactHitVector()),
		).toThrow(/not in this index/);
	});

	it("THROWS for a query of the wrong dimension", () => {
		expect(() =>
			fixtureIndex().similarityOf("e_ivanov", new Float32Array(8)),
		).toThrow(/dims/);
	});

	it("THROWS after dispose rather than reading a released matrix", () => {
		const index = fixtureIndex();
		index.dispose();
		expect(() => index.similarityOf("e_ivanov", exactHitVector())).toThrow(
			/disposed/,
		);
	});
});
