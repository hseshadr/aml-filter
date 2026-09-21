// AML's watchlist-facing compatibility layer over the shared immutable packed
// vector primitive. The shared package owns exact cosine retrieval; this thin
// adapter retains AML's established synchronous `{ id, score }` contract and
// its user-facing validation errors.

import { PackedVectorIndex } from "@edgeproc/browser/vector";

/** A scored retrieval hit: an entity id and its cosine similarity to the query. */
export interface VectorHit {
	readonly id: string;
	readonly score: number;
}

/** Loaded, query-ready vector index over the decoded watchlist vectors. */
export class VectorIndex {
	readonly #index: PackedVectorIndex;
	readonly #dim: number;
	#ids: ReadonlyArray<string>;
	#disposed = false;
	/** id -> row, built once on the first similarityOf call. */
	#rowOf: Map<string, number> | null = null;

	public constructor(
		matrix: Float32Array,
		ids: ReadonlyArray<string>,
		dim: number,
	) {
		if (matrix.length !== ids.length * dim) {
			throw new Error(
				`matrix has ${matrix.length} floats; expected ${ids.length * dim} (${ids.length} rows * ${dim} dim)`,
			);
		}
		this.#index = new PackedVectorIndex(matrix, ids, dim);
		this.#ids = ids;
		this.#dim = dim;
	}

	public get ntotal(): number {
		return this.#disposed ? 0 : this.#index.ntotal;
	}

	public get dim(): number {
		return this.#dim;
	}

	/** Release the packed matrix after a streamed list has been scored. */
	public dispose(): void {
		if (this.#disposed) return;
		this.#index.dispose();
		this.#ids = [];
		this.#rowOf = null;
		this.#disposed = true;
	}

	public idAt(row: number): string {
		const id = this.#ids[row];
		if (id === undefined) {
			throw new RangeError(`row ${row} out of range`);
		}
		return this.#index.idAt(row);
	}

	/** Cosine of one known entity against the query. */
	public similarityOf(id: string, queryVec: Float32Array): number {
		this.#row(id);
		this.#assertQueryDimension(queryVec);
		return this.#index.similarityOf(id, queryVec);
	}

	/** Exact cosine top-k, retaining stable producer-order tie breaking. */
	public search(queryVec: Float32Array, k: number): ReadonlyArray<VectorHit> {
		this.#assertOpen();
		this.#assertQueryDimension(queryVec);
		return this.#index
			.search(queryVec, normalizedLimit(k, this.ntotal))
			.map(({ id, similarity }) => ({ id, score: similarity }));
	}

	#assertOpen(): void {
		if (this.#disposed) {
			throw new Error("vector index has been disposed");
		}
	}

	#assertQueryDimension(queryVec: Float32Array): void {
		if (queryVec.length !== this.#dim) {
			throw new Error(
				`query vector has ${queryVec.length} dims; index is ${this.#dim}`,
			);
		}
	}

	#row(id: string): number {
		this.#assertOpen();
		if (this.#rowOf === null) {
			this.#rowOf = new Map(this.#ids.map((value, row) => [value, row]));
		}
		const row = this.#rowOf.get(id);
		if (row === undefined) {
			throw new RangeError(`entity id "${id}" is not in this index`);
		}
		return row;
	}
}

function normalizedLimit(limit: number, size: number): number {
	if (Number.isNaN(limit) || limit <= 0) return 0;
	if (limit === Number.POSITIVE_INFINITY) return size;
	return Math.trunc(limit);
}
