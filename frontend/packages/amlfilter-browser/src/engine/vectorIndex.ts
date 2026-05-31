// In-browser vector retrieval over the synced OFAC bundle. The Phase 2 producer
// (aml_filter.bundle.publish) saves edge-proc's localvec index VERBATIM — i.e. a
// binary FAISS `IndexFlatIP` at `vector/index.faiss` plus a `vector/state.json`
// sidecar carrying the row->entity_id map (`faiss_ids`). There is no separate
// `embeddings.f32`, so this reader parses the raw L2-normalized float32 rows
// straight out of the FAISS flat-index binary.
//
// FAISS `IndexFlatIP` on-disk layout (little-endian), as written by
// `faiss.write_index`:
//   fourcc           4 bytes  "IxFI"
//   d                int32    dimension
//   ntotal           int64    number of stored vectors
//   dummy            int64    (legacy IndexFlat header padding)
//   dummy            int64
//   is_trained       1 byte
//   metric_type      int32    (0 == inner product)
//   codes.size       int64    number of float32 elements (== ntotal * d)
//   codes            float32[size]   row-major, L2-normalized at encode time
//
// Row `i` of the codes block is the vector for `state.json` `faiss_ids[i]`, so
// cosine == dot product and the only renormalization needed is on the query.

const DECODER = new TextDecoder();

/** The FAISS `IndexFlatIP` fourcc magic, as ASCII bytes. */
const FAISS_FLAT_FOURCC = "IxFI";
const FLOAT32_BYTES = 4;

/** The two reassembled bundle files the index is built from. */
export interface VectorIndexFiles {
	/** vector/index.faiss — the binary FAISS IndexFlatIP (raw float32 rows). */
	readonly index: Uint8Array;
	/** vector/state.json — carries the faiss_ids row->entity_id map. */
	readonly state: Uint8Array;
}

/** A scored retrieval hit: an entity id and its cosine similarity to the query. */
export interface VectorHit {
	readonly id: string;
	readonly score: number;
}

interface VectorState {
	readonly faiss_ids: ReadonlyArray<string>;
}

/** A stored FAISS index whose bytes do not match the documented flat layout. */
export class FaissParseError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = "FaissParseError";
	}
}

function parseJson<T>(bytes: Uint8Array): T {
	return JSON.parse(DECODER.decode(bytes)) as T;
}

interface FaissFlat {
	readonly dim: number;
	readonly ntotal: number;
	/** Row-major L2-normalized matrix, ntotal x dim. */
	readonly matrix: Float32Array;
}

/** Parse the FAISS IndexFlatIP header + raw float32 codes (fail-closed). */
function parseFaissFlat(index: Uint8Array): FaissFlat {
	// Copy into a fresh, 4-byte-aligned buffer: the reassembled chunk bytes may
	// not be aligned, and Float32Array requires a 4-byte-aligned byteOffset.
	const buffer = index.slice().buffer;
	const view = new DataView(buffer);
	const fourcc = DECODER.decode(new Uint8Array(buffer, 0, 4));
	if (fourcc !== FAISS_FLAT_FOURCC) {
		throw new FaissParseError(
			`expected FAISS flat fourcc ${FAISS_FLAT_FOURCC}, got ${JSON.stringify(fourcc)}`,
		);
	}
	const dim = view.getInt32(4, true);
	const ntotal = Number(view.getBigInt64(8, true));
	// offset 16..31: two int64 legacy-padding fields. offset 32: is_trained (1).
	// offset 33: metric_type (int32). offset 37: codes.size (int64). offset 45: codes.
	const codesSize = Number(view.getBigInt64(37, true));
	if (codesSize !== ntotal * dim) {
		throw new FaissParseError(
			`codes.size ${codesSize} != ntotal*dim ${ntotal * dim}`,
		);
	}
	const codesByteOffset = 45;
	const codesByteLength = codesSize * FLOAT32_BYTES;
	const expectedBytes = codesByteOffset + codesByteLength;
	if (buffer.byteLength < expectedBytes) {
		throw new FaissParseError(
			`index.faiss is ${buffer.byteLength} bytes; expected at least ${expectedBytes}`,
		);
	}
	// The codes block starts at byte 45, which is not 4-byte aligned, so it
	// cannot be a Float32Array view directly — copy it into its own buffer.
	const codes = buffer.slice(
		codesByteOffset,
		codesByteOffset + codesByteLength,
	);
	const matrix = new Float32Array(codes);
	return { dim, ntotal, matrix };
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

/** Loaded, query-ready vector index over the synced bundle. */
export class VectorIndex {
	readonly #matrix: Float32Array;
	readonly #ids: ReadonlyArray<string>;
	readonly #dim: number;
	readonly #ntotal: number;

	public constructor(
		matrix: Float32Array,
		ids: ReadonlyArray<string>,
		dim: number,
	) {
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

	public idAt(row: number): string {
		const id = this.#ids[row];
		if (id === undefined) {
			throw new RangeError(`row ${row} out of range`);
		}
		return id;
	}

	/**
	 * Cosine top-k. Stored rows are L2-normalized, so cosine == dot product; the
	 * query is normalized here so a non-unit input scores correctly. A flat scan
	 * is exact and plenty fast for the OFAC list's ~10^4 rows.
	 */
	public search(queryVec: Float32Array, k: number): ReadonlyArray<VectorHit> {
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
		// deterministic and matches the producer's stable insertion order.
		scored.sort((a, b) => b.score - a.score || a.row - b.row);
		return scored
			.slice(0, Math.max(0, k))
			.map((hit) => ({ id: this.idAt(hit.row), score: hit.score }));
	}
}

/** Parse the synced files and build a query-ready VectorIndex (fail-closed). */
export function loadVectorIndex(files: VectorIndexFiles): VectorIndex {
	const state = parseJson<VectorState>(files.state);
	const flat = parseFaissFlat(files.index);
	if (flat.ntotal !== state.faiss_ids.length) {
		throw new FaissParseError(
			`index.faiss ntotal ${flat.ntotal} != state.json faiss_ids length ${state.faiss_ids.length}`,
		);
	}
	return new VectorIndex(flat.matrix, state.faiss_ids, flat.dim);
}
