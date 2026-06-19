// The v3 signed-watchlist wire contract (see docs/WATCHLIST_FORMAT.md).
//
// The publisher emits four static files; these types describe the JSON shapes.
// The browser tier (@amlfilter/browser) syncs and verifies them fail-closed.

/** One screened entity, as it appears in `watchlist.json`. */
export interface WatchlistEntity {
	/** Stable source identifier, e.g. "OFAC-12345" or "DEMO_SDN:0001". */
	readonly entity_id: string;
	/** Canonical name, produced by the SAME canonicalize() the browser uses. */
	readonly name_canonical: string;
	/** Raw alias display names. */
	readonly aliases: readonly string[];
	/** A single date-of-birth string, or null when unknown. */
	readonly dob: string | null;
	/** ISO-3166 country codes, sorted, deterministic. */
	readonly countries: readonly string[];
	/** Source risk classification (e.g. "SANCTION"). */
	readonly risk_category: string;
	/** The originating list id (e.g. "OFAC_SDN"). */
	readonly source_list: string;
	/** The source list's own version stamp. */
	readonly list_version: string;
}

/** The full `watchlist.json` document: entities + precomputed name vectors. */
export interface Watchlist {
	readonly listId: string;
	readonly version: string;
	/** ISO-8601 UTC instant (…Z). */
	readonly generatedAt: string;
	/** transformers.js model id (mirrors the browser's EMBEDDING_MODEL). */
	readonly model: string;
	/** Embedding dimension (mirrors the browser's EMBEDDING_DIM). */
	readonly dim: number;
	readonly entities: readonly WatchlistEntity[];
	/**
	 * Base64 of a raw little-endian Float32 buffer, row-major,
	 * length = entities.length * dim. Row i is the embedding of
	 * entities[i].name_canonical. Decoded in-tab:
	 * `new Float32Array(decode(base64)).buffer`.
	 */
	readonly vectors: string;
}

/** The tiny `watchlist.manifest.json` document, polled for cheap version checks. */
export interface WatchlistManifest {
	readonly listId: string;
	readonly version: string;
	readonly generatedAt: string;
	readonly model: string;
	readonly dim: number;
	readonly entitiesCount: number;
}
