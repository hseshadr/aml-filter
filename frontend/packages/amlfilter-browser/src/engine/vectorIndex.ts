// In-browser vector retrieval over the synced OFAC watchlist. The v3 publisher
// (frontend/packages/amlfilter-publisher) precomputes one L2-normalized
// embedding per entity and ships them as a base64 LE Float32 buffer inside the
// signed watchlist.json (see ./watchlist). That buffer is decoded into a
// row-major matrix and handed to this index VERBATIM — no FAISS, no on-disk
// index format. Row `i` is the vector for entity id `ids[i]`, L2-normalized at
// publish time, so cosine == dot product and the only renormalization needed is
// on the query.

/** A scored retrieval hit: an entity id and its cosine similarity to the query. */
export interface VectorHit {
	readonly id: string;
	readonly score: number;
}

function normalize(vector: Float32Array): Float32Array {
	let sumSq = 0;
	for (const value of vector) {
		sumSq += value * value;
	}
	const norm = Math.sqrt(sumSq);
	if (norm === 0) {
		return vector;
	}
	const out = new Float32Array(vector.length);
	for (let i = 0; i < vector.length; i += 1) {
		out[i] = (vector[i] ?? 0) / norm;
	}
	return out;
}

/** Loaded, query-ready vector index over the decoded watchlist vectors. */
export class VectorIndex {
	#matrix: Float32Array;
	#ids: ReadonlyArray<string>;
	readonly #dim: number;
	#ntotal: number;
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
		this.#matrix = matrix;
		this.#ids = ids;
		this.#dim = dim;
		this.#ntotal = ids.length;
	}

	public get ntotal(): number {
		return this.#ntotal;
	}

	public get dim(): number {
		return this.#dim;
	}

	/** Release the matrix and row ids after a streamed list has been scored. */
	public dispose(): void {
		this.#matrix = new Float32Array(0);
		this.#ids = [];
		this.#ntotal = 0;
		this.#rowOf = null;
		this.#disposed = true;
	}

	public idAt(row: number): string {
		const id = this.#ids[row];
		if (id === undefined) {
			throw new RangeError(`row ${row} out of range`);
		}
		return id;
	}

	/**
	 * Cosine of ONE known entity against the query — the same number `search`
	 * would have reported for that row, without asking for a ranking.
	 *
	 * Retrieval is a union: candidates also arrive from the lexical/phonetic
	 * index, and those still need a real `name_vector` signal to be scored beside
	 * the vector hits. Fabricating a placeholder similarity for them would put a
	 * made-up number into an explainable score and into the signed receipt, so
	 * the index computes the honest one instead.
	 *
	 * Throws for an unknown id: a caller asking about an entity this index has
	 * never seen has a bug, and returning 0 would hide it as a weak match.
	 */
	public similarityOf(id: string, queryVec: Float32Array): number {
		const row = this.#row(id);
		if (queryVec.length !== this.#dim) {
			throw new Error(
				`query vector has ${queryVec.length} dims; index is ${this.#dim}`,
			);
		}
		const base = row * this.#dim;
		let dot = 0;
		let querySumSq = 0;
		for (let i = 0; i < this.#dim; i += 1) {
			const q = queryVec[i] ?? 0;
			dot += (this.#matrix[base + i] ?? 0) * q;
			querySumSq += q * q;
		}
		// Stored rows are unit-length, so dividing by |query| alone yields cosine.
		return querySumSq === 0 ? 0 : dot / Math.sqrt(querySumSq);
	}

	#row(id: string): number {
		if (this.#disposed) {
			throw new Error("vector index has been disposed");
		}
		if (this.#rowOf === null) {
			this.#rowOf = new Map(this.#ids.map((value, row) => [value, row]));
		}
		const row = this.#rowOf.get(id);
		if (row === undefined) {
			throw new RangeError(`entity id "${id}" is not in this index`);
		}
		return row;
	}

	/**
	 * Cosine top-k. Stored rows are L2-normalized, so cosine == dot product; the
	 * query is normalized here so a non-unit input scores correctly. A flat scan
	 * is exact and plenty fast for the OFAC list's ~10^4 rows.
	 */
	public search(queryVec: Float32Array, k: number): ReadonlyArray<VectorHit> {
		if (this.#disposed) {
			throw new Error("vector index has been disposed");
		}
		if (queryVec.length !== this.#dim) {
			throw new Error(
				`query vector has ${queryVec.length} dims; index is ${this.#dim}`,
			);
		}
		const query = normalize(queryVec);
		const scored: { readonly row: number; readonly score: number }[] = [];
		for (let row = 0; row < this.#ntotal; row += 1) {
			let dot = 0;
			const base = row * this.#dim;
			for (let i = 0; i < this.#dim; i += 1) {
				dot += (this.#matrix[base + i] ?? 0) * (query[i] ?? 0);
			}
			scored.push({ row, score: dot });
		}
		// Descending score; ties broken by ascending row index so the ordering is
		// deterministic and matches the publisher's stable insertion order.
		scored.sort((a, b) => b.score - a.score || a.row - b.row);
		return scored
			.slice(0, Math.max(0, k))
			.map((hit) => ({ id: this.idAt(hit.row), score: hit.score }));
	}
}
