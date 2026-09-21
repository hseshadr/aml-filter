// AML's watchlist-facing adapter over the shared SQLite + sqlite-vector
// browser runtime. Each signed list is already durably cached in OPFS, so this
// derived query index deliberately uses an isolated in-memory SQLite database:
// one durable copy of the bundle, no stale per-version database files, and all
// semantic scoring still runs through sqlite-vector in a Worker.

import type { VectorIndex as SharedVectorIndex } from "@edgeproc/browser/vector";
import {
	createSqliteVectorIndex,
	type SqliteKeyedVectorRecord,
	type SqliteLookupKey,
	type SqliteVectorWorkerOptions,
} from "@edgeproc/browser/vector/sqlite";

/** A scored retrieval hit: an entity id and its cosine similarity to the query. */
export interface VectorHit {
	readonly id: string;
	readonly score: number;
}

const INSERT_BATCH_SIZE = 512;

/** Environment adapter: browser Worker in product, in-process SQLite in Node evals. */
interface AmlSqliteVectorIndex extends SharedVectorIndex {
	insertKeyed(records: ReadonlyArray<SqliteKeyedVectorRecord>): Promise<void>;
	lookupIds(
		keys: ReadonlyArray<SqliteLookupKey>,
		maxDocumentFrequency: number,
	): Promise<ReadonlyArray<string>>;
}

export type AmlVectorIndexFactory = (
	options: SqliteVectorWorkerOptions,
) => Promise<AmlSqliteVectorIndex>;

/** Loaded, query-ready vector index over the decoded watchlist vectors. */
export class VectorIndex {
	readonly #dim: number;
	readonly #ready: Promise<AmlSqliteVectorIndex>;
	readonly #factory: AmlVectorIndexFactory;
	#ids: ReadonlyArray<string>;
	#disposed = false;

	public constructor(
		matrix: Float32Array,
		ids: ReadonlyArray<string>,
		dim: number,
		factory: AmlVectorIndexFactory = createSqliteVectorIndex,
		lookupKeysById: ReadonlyMap<
			string,
			ReadonlyArray<SqliteLookupKey>
		> = new Map(),
	) {
		if (matrix.length !== ids.length * dim) {
			throw new Error(
				`matrix has ${matrix.length} floats; expected ${ids.length * dim} (${ids.length} rows * ${dim} dim)`,
			);
		}
		this.#ids = [...ids];
		this.#dim = dim;
		this.#factory = factory;
		this.#ready = this.#initialize(matrix, ids, lookupKeysById);
	}

	public get ntotal(): number {
		return this.#disposed ? 0 : this.#ids.length;
	}

	public get dim(): number {
		return this.#dim;
	}

	/** Wait until the Worker, SQLite runtime, and all rows are query-ready. */
	public async ready(): Promise<void> {
		await this.#openIndex();
	}

	/** Release the SQLite Worker after a streamed list has been scored. */
	public dispose(): void {
		if (this.#disposed) return;
		this.#disposed = true;
		this.#ids = [];
		void this.#ready.then((index) => index.dispose()).catch(() => undefined);
	}

	public idAt(row: number): string {
		this.#assertOpen();
		const id = this.#ids[row];
		if (id === undefined) {
			throw new RangeError(`row ${row} out of range`);
		}
		return id;
	}

	/** Cosines for known candidates in one sqlite-vector scan. */
	public async searchByIds(
		queryVec: Float32Array,
		ids: ReadonlyArray<string>,
	): Promise<ReadonlyArray<VectorHit>> {
		this.#assertQueryDimension(queryVec);
		const unique = [...new Set(ids)];
		for (const id of unique) {
			this.#assertKnownId(id);
		}
		const index = await this.#openIndex();
		return (await index.searchByIds(queryVec, unique)).map(
			({ id, distance }) => ({ id, score: distanceToSimilarity(distance) }),
		);
	}

	/** Resolve exact lexical/phonetic keys through SQLite's bounded postings. */
	public async lookupIds(
		keys: ReadonlyArray<SqliteLookupKey>,
		maxDocumentFrequency: number,
	): Promise<ReadonlyArray<string>> {
		this.#assertOpen();
		return (await this.#openIndex()).lookupIds(keys, maxDocumentFrequency);
	}

	/** Exact cosine top-k, retaining deterministic id tie breaking. */
	public async search(
		queryVec: Float32Array,
		k: number,
	): Promise<ReadonlyArray<VectorHit>> {
		this.#assertOpen();
		this.#assertQueryDimension(queryVec);
		const index = await this.#openIndex();
		return (await index.search(queryVec, normalizedLimit(k, this.ntotal))).map(
			({ id, distance }) => ({ id, score: distanceToSimilarity(distance) }),
		);
	}

	async #initialize(
		matrix: Float32Array,
		ids: ReadonlyArray<string>,
		lookupKeysById: ReadonlyMap<string, ReadonlyArray<SqliteLookupKey>>,
	): Promise<AmlSqliteVectorIndex> {
		const index = await this.#factory({
			name: "aml-watchlist",
			dimension: this.#dim,
			persistence: "memory",
		});
		try {
			for (let start = 0; start < ids.length; start += INSERT_BATCH_SIZE) {
				const end = Math.min(start + INSERT_BATCH_SIZE, ids.length);
				await index.insertKeyed(
					ids.slice(start, end).map((id, offset) => {
						const row = start + offset;
						return {
							id,
							vector: matrix.subarray(row * this.#dim, (row + 1) * this.#dim),
							metadata: { entityId: id },
							lookupKeys: lookupKeysById.get(id) ?? [],
						};
					}),
				);
			}
			return index;
		} catch (error) {
			await index.dispose();
			throw error;
		}
	}

	async #openIndex(): Promise<AmlSqliteVectorIndex> {
		this.#assertOpen();
		const index = await this.#ready;
		this.#assertOpen();
		return index;
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

	#assertKnownId(id: string): void {
		this.#assertOpen();
		if (!this.#ids.includes(id)) {
			throw new RangeError(
				`entity id ${JSON.stringify(id)} is not in this index`,
			);
		}
	}
}

function normalizedLimit(limit: number, size: number): number {
	if (Number.isNaN(limit) || limit <= 0) return 0;
	if (limit === Number.POSITIVE_INFINITY) return size;
	return Math.min(Math.trunc(limit), size);
}

function distanceToSimilarity(distance: number): number {
	return 1 - distance;
}
