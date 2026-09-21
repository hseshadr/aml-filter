import { beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => ({
	construct: vi.fn(),
	dispose: vi.fn(),
	idAt: vi.fn<(row: number) => string>(),
	search:
		vi.fn<
			(
				query: Float32Array,
				limit: number,
			) => ReadonlyArray<{ readonly id: string; readonly similarity: number }>
		>(),
	similarityOf: vi.fn<(id: string, query: Float32Array) => number>(),
}));

vi.mock("@edgeproc/browser/vector", () => ({
	PackedVectorIndex: class {
		public readonly dim = 2;
		public readonly ntotal = 2;

		public constructor(
			matrix: Float32Array,
			ids: ReadonlyArray<string>,
			dim: number,
		) {
			shared.construct(matrix, ids, dim);
		}

		public search(query: Float32Array, limit: number) {
			return shared.search(query, limit);
		}

		public similarityOf(id: string, query: Float32Array) {
			return shared.similarityOf(id, query);
		}

		public idAt(row: number) {
			return shared.idAt(row);
		}

		public dispose() {
			shared.dispose();
		}
	},
}));

import { VectorIndex } from "./vectorIndex";

describe("VectorIndex shared packed-index adapter", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		shared.search.mockReturnValue([{ id: "entity-2", similarity: 0.875 }]);
		shared.similarityOf.mockReturnValue(0.625);
		shared.idAt.mockReturnValue("entity-1");
	});

	it("constructs and delegates to PackedVectorIndex while preserving AML hits", () => {
		const matrix = new Float32Array([1, 0, 0, 1]);
		const ids = ["entity-1", "entity-2"];
		const index = new VectorIndex(matrix, ids, 2);
		const query = new Float32Array([0, 1]);

		expect(shared.construct).toHaveBeenCalledWith(matrix, ids, 2);
		expect(index.search(query, 1)).toEqual([{ id: "entity-2", score: 0.875 }]);
		expect(shared.search).toHaveBeenCalledWith(query, 1);
		expect(index.similarityOf("entity-1", query)).toBe(0.625);
		expect(shared.similarityOf).toHaveBeenCalledWith("entity-1", query);
		expect(index.idAt(0)).toBe("entity-1");
		expect(shared.idAt).toHaveBeenCalledWith(0);
	});

	it("delegates disposal and preserves the released AML view", () => {
		const index = new VectorIndex(
			new Float32Array([1, 0, 0, 1]),
			["entity-1", "entity-2"],
			2,
		);

		index.dispose();

		expect(shared.dispose).toHaveBeenCalledOnce();
		expect(index.ntotal).toBe(0);
		expect(() => index.search(new Float32Array([1, 0]), 1)).toThrow(
			"vector index has been disposed",
		);
	});
});
