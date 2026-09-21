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

	it("cosine-ranks the exact-hit entity first with similarity ~1.0", async () => {
		const hits = await fixtureIndex().search(exactHitVector(), 3);
		expect(hits[0]?.id).toBe("e_ivanov");
		expect(hits[0]?.score).toBeCloseTo(1.0, 5);
		// The orthogonal rows score ~0 — strictly below the exact hit.
		expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? 1);
	});

	it("normalizes a non-unit query before scoring", async () => {
		const v = new Float32Array(DIM);
		v[0] = 5; // non-unit; cosine with the unit row is still 1.0
		expect((await fixtureIndex().search(v, 1))[0]?.score).toBeCloseTo(1.0, 5);
	});

	it("rejects a matrix whose length disagrees with ids*dim (fail-closed)", () => {
		expect(() => new VectorIndex(new Float32Array(5), ["a"], DIM)).toThrow();
	});

	it("rejects a query of the wrong dimension", async () => {
		await expect(
			fixtureIndex().search(new Float32Array(8), 3),
		).rejects.toThrow();
	});

	it("idAt fails loudly for a row outside the index (no silent undefined)", () => {
		expect(() => fixtureIndex().idAt(999)).toThrow(RangeError);
		expect(() => fixtureIndex().idAt(999)).toThrow(/out of range/);
	});
});

// searchByIds backs union retrieval: candidates that arrived from the lexical
// index still need REAL name_vector signals, resolved in one SQLite scan.
describe("VectorIndex.searchByIds — batched cosine for known entities", () => {
	it("reports the same number search would have reported for that row", async () => {
		const index = fixtureIndex();
		const hit = (await index.search(exactHitVector(), 1))[0];
		const named = await index.searchByIds(exactHitVector(), ["e_ivanov"]);
		expect(named[0]?.score).toBeCloseTo(hit?.score ?? Number.NaN, 10);
	});

	it("scores entities the vector top-k never returned in one batch", async () => {
		// e_acme is orthogonal to the query, so a top-1 search misses it entirely;
		// its honest cosine is still ~0 and must be computable.
		await expect(
			fixtureIndex().searchByIds(exactHitVector(), ["e_acme", "e_petrov"]),
		).resolves.toEqual([
			{ id: "e_acme", score: 0 },
			{ id: "e_petrov", score: 0 },
		]);
	});

	it("normalizes a non-unit query, exactly as search does", async () => {
		const v = new Float32Array(DIM);
		v[0] = 5;
		const hits = await fixtureIndex().searchByIds(v, ["e_ivanov"]);
		expect(hits[0]?.score).toBeCloseTo(1.0, 5);
	});

	it("returns 0 for an all-zero query rather than dividing by zero", async () => {
		const hits = await fixtureIndex().searchByIds(new Float32Array(DIM), [
			"e_ivanov",
		]);
		expect(hits[0]?.score).toBe(0);
	});

	it("THROWS for an entity id the index has never seen (no silent 0)", async () => {
		await expect(
			fixtureIndex().searchByIds(exactHitVector(), ["e_nobody"]),
		).rejects.toThrow(RangeError);
		await expect(
			fixtureIndex().searchByIds(exactHitVector(), ["e_nobody"]),
		).rejects.toThrow(/not in this index/);
	});

	it("THROWS for a query of the wrong dimension", async () => {
		await expect(
			fixtureIndex().searchByIds(new Float32Array(8), ["e_ivanov"]),
		).rejects.toThrow(/dims/);
	});

	it("THROWS after dispose rather than reading a released matrix", async () => {
		const index = fixtureIndex();
		index.dispose();
		await expect(
			index.searchByIds(exactHitVector(), ["e_ivanov"]),
		).rejects.toThrow(/disposed/);
	});
});
