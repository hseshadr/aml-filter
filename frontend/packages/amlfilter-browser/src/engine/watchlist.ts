// The v3 signed-watchlist loader — the in-browser replacement for the chunked
// edge-proc bundle sync. It fetches ONE signed JSON watchlist (same-origin,
// relative to document.baseURI), verifies its detached Ed25519 signature
// FAIL-CLOSED against the pinned public key BEFORE parsing, decodes the
// precomputed Float32 vectors, and projects the lean wire entities onto the
// domain Entity shape the scorer + UI consume.
//
// Wire contract: docs/WATCHLIST_FORMAT.md.
//   - watchlist.manifest.json (+ .sig): tiny, polled for cheap version checks.
//   - watchlist.json          (+ .sig): entities[] + base64 Float32 vectors,
//     row-major, length = entities.length * dim; row i = embedding of
//     entities[i].name_canonical.
//
// Trust is end-to-end: the .sig is a detached base64 Ed25519 signature over the
// EXACT file bytes; the public key is pinned same-origin from public.key (never
// the watchlist origin). Any verify failure aborts the load with NO fallback.

import { verifyEd25519 } from "./crypto";
import type { Alias, Entity, EntityType, RiskCategory } from "./domain";
import { canonicalize } from "./normalize";
import { VectorIndex } from "./vectorIndex";

/** all-MiniLM-L6-v2 embedding dimension; the only dim the engine accepts. */
const EXPECTED_DIM = 384;
const FLOAT32_BYTES = 4;
/** Entity type assumed when the lean wire record omits it (scorer signal only). */
const DEFAULT_ENTITY_TYPE: EntityType = "PERSON";
/** The only risk buckets the engine accepts; any other value is rejected. */
const RISK_CATEGORIES: ReadonlySet<RiskCategory> = new Set([
	"SANCTION",
	"PEP",
	"CUSTOM",
	"WHITELIST",
]);

/** One screened entity exactly as it appears in `watchlist.json`. */
export interface WatchlistEntity {
	readonly entity_id: string;
	readonly name_canonical: string;
	readonly aliases: ReadonlyArray<string>;
	readonly dob: string | null;
	readonly countries: ReadonlyArray<string>;
	readonly risk_category: string;
	readonly source_list: string;
	readonly list_version: string;
}

/** The full `watchlist.json` document: entities + precomputed name vectors. */
export interface Watchlist {
	readonly listId: string;
	readonly version: string;
	readonly generatedAt: string;
	readonly model: string;
	readonly dim: number;
	readonly entities: ReadonlyArray<WatchlistEntity>;
	/** Base64 of a raw LE Float32 buffer, row-major, length entities.length*dim. */
	readonly vectors: string;
}

/** The tiny `watchlist.manifest.json` document, polled for version checks. */
export interface WatchlistManifest {
	readonly listId: string;
	readonly version: string;
	readonly generatedAt: string;
	readonly model: string;
	readonly dim: number;
	readonly entitiesCount: number;
}

/** One list entry in the signed catalog: id, title, version, count + dir path. */
export interface WatchlistCatalogEntry {
	readonly id: string;
	readonly title: string;
	readonly version: string;
	readonly entitiesCount: number;
	/** Dir prefix under `watchlist/`, e.g. "ofac/" (trailing slash included). */
	readonly path: string;
}

/** The signed `catalog.json`: the manifest of every published list. */
export interface WatchlistCatalog {
	readonly schema: 1;
	readonly generatedAt: string;
	readonly lists: ReadonlyArray<WatchlistCatalogEntry>;
}

/** Raised when a watchlist document is structurally invalid (fail-closed). */
export class WatchlistFormatError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = "WatchlistFormatError";
	}
}

/** A loaded watchlist: the cosine index, the id->Entity map, and the version. */
export interface LoadedWatchlist {
	readonly index: VectorIndex;
	readonly entities: ReadonlyMap<string, Entity>;
	readonly version: string;
	readonly listId: string;
}

const DECODER = new TextDecoder();

/** Fetch raw bytes same-origin, no-store (the artifacts are mutable on refresh). */
async function fetchFileBytes(url: string): Promise<Uint8Array> {
	const response = await fetch(url, { cache: "no-store" });
	if (!response.ok) {
		throw new WatchlistFormatError(
			`fetch ${url} failed: HTTP ${response.status}`,
		);
	}
	return new Uint8Array(await response.arrayBuffer());
}

/** Fetch a `.sig` file and return its trimmed base64 text. */
async function fetchSignature(url: string): Promise<string> {
	return DECODER.decode(await fetchFileBytes(url)).trim();
}

/**
 * Verify FAIL-CLOSED against the pinned key over the EXACT bytes, then parse the
 * JSON. Verify runs BEFORE parse so unverified bytes never reach JSON.parse.
 * Extracted so the SAME verify-then-parse step runs over bytes already in hand —
 * notably the durable cache's bytes, which are re-verified on every load (the
 * cache is a byte store, never a trust store; see watchlistCache.ts). Throws
 * SignatureError on a bad signature, the same fail-closed contract as the fetch.
 */
export async function verifyAndParse<T>(
	bytes: Uint8Array,
	signatureBase64: string,
	pubkey: Uint8Array,
): Promise<T> {
	await verifyEd25519(pubkey, bytes, signatureBase64);
	return JSON.parse(DECODER.decode(bytes)) as T;
}

/** A signed artifact's raw bytes + its detached base64 signature, fetched but
 * NOT yet verified — the durable-cache write unit (verify happens in
 * verifyAndParse, before any parse, on both the fetch and the cache paths). */
export interface VerifiableArtifact {
	readonly bytes: Uint8Array;
	readonly signatureBase64: string;
}

/** Fetch a signed file + its detached `.sig` (no-store), same-origin relative to
 * document.baseURI. Returns the raw bytes + signature UNVERIFIED — the caller
 * passes them to verifyAndParse (fail-closed) before trusting/parsing. */
export async function fetchArtifact(
	relativePath: string,
): Promise<VerifiableArtifact> {
	const url = new URL(relativePath, document.baseURI).toString();
	const [bytes, signatureBase64] = await Promise.all([
		fetchFileBytes(url),
		fetchSignature(`${url}.sig`),
	]);
	return { bytes, signatureBase64 };
}

/**
 * Fetch a signed file + its detached `.sig`, verify FAIL-CLOSED against the
 * pinned key over the EXACT file bytes, then parse the JSON. Verify runs BEFORE
 * parse so unverified bytes never reach JSON.parse. The url is resolved relative
 * to `document.baseURI` so it is always same-origin with the SPA.
 */
async function fetchVerifiedJson<T>(
	relativePath: string,
	pubkey: Uint8Array,
): Promise<T> {
	const { bytes, signatureBase64 } = await fetchArtifact(relativePath);
	return verifyAndParse<T>(bytes, signatureBase64, pubkey);
}

/** Same-origin relative path of the signed catalog document. */
export const CATALOG_PATH = "watchlist/catalog.json";

/** Same-origin relative path of a list's signed watchlist document. */
export function listWatchlistPath(entry: WatchlistCatalogEntry): string {
	return `watchlist/${entry.path}watchlist.json`;
}

/** Decode a base64 string into raw bytes (browser atob, no Buffer dependency). */
function base64ToBytes(b64: string): Uint8Array {
	const binary = atob(b64);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		out[i] = binary.charCodeAt(i);
	}
	return out;
}

/** Decode the base64 Float32 buffer, validating dim and the row count. */
function decodeVectors(
	base64: string,
	dim: number,
	entityCount: number,
): Float32Array {
	const bytes = base64ToBytes(base64);
	if (bytes.byteLength !== entityCount * dim * FLOAT32_BYTES) {
		throw new WatchlistFormatError(
			`vectors are ${bytes.byteLength} bytes; expected ${entityCount * dim * FLOAT32_BYTES} (${entityCount} entities * ${dim} dim * ${FLOAT32_BYTES})`,
		);
	}
	// Copy into a fresh, 4-byte-aligned buffer: atob output may not be aligned,
	// and Float32Array requires a 4-byte-aligned byteOffset.
	return new Float32Array(bytes.slice().buffer);
}

/** Title-case a canonical (lowercase) name for display, e.g. "ivan fakovich". */
function displayName(canonical: string): string {
	return canonical
		.split(" ")
		.filter((word) => word.length > 0)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/** Project a lean wire alias name onto the domain Alias shape. */
function toAlias(name: string): Alias {
	return { name, name_canonical: canonicalize(name), source: "" };
}

/** Narrow a wire risk_category to the domain union fail-closed, else throw. */
function assertRiskCategory(value: string, entityId: string): RiskCategory {
	if (RISK_CATEGORIES.has(value as RiskCategory)) {
		return value as RiskCategory;
	}
	throw new WatchlistFormatError(
		`entity ${entityId} has risk_category "${value}"; expected one of ${[...RISK_CATEGORIES].join(", ")}`,
	);
}

/**
 * Project a lean watchlist entity onto the domain Entity the scorer + UI use.
 * The wire shape omits entity_type and a display primary_name and carries a
 * single dob string; we default the type, title-case the canonical for display,
 * and lift the dob into the array shape the scorer's dob signal expects.
 */
function toEntity(wire: WatchlistEntity): Entity {
	return {
		entity_id: wire.entity_id,
		entity_type: DEFAULT_ENTITY_TYPE,
		primary_name: displayName(wire.name_canonical),
		name_canonical: wire.name_canonical,
		aliases: wire.aliases.map(toAlias),
		dob: wire.dob !== null ? [wire.dob] : [],
		countries: wire.countries,
		nationalities: [],
		addresses: [],
		risk_category: assertRiskCategory(wire.risk_category, wire.entity_id),
		source_list: wire.source_list,
		list_version: wire.list_version,
	};
}

/** Validate the watchlist header fields fail-closed before building the index. */
function assertWatchlistShape(watchlist: Watchlist): void {
	if (watchlist.dim !== EXPECTED_DIM) {
		throw new WatchlistFormatError(
			`watchlist dim is ${watchlist.dim}; expected ${EXPECTED_DIM}`,
		);
	}
	if (
		!Array.isArray(watchlist.entities) ||
		typeof watchlist.vectors !== "string"
	) {
		throw new WatchlistFormatError(
			"watchlist is missing entities[] or vectors",
		);
	}
}

/** Build the cosine index + id->Entity map from a verified, parsed watchlist. */
function buildLoaded(watchlist: Watchlist): LoadedWatchlist {
	assertWatchlistShape(watchlist);
	const ids = watchlist.entities.map((e) => e.entity_id);
	const matrix = decodeVectors(watchlist.vectors, watchlist.dim, ids.length);
	const entities = new Map<string, Entity>();
	for (const wire of watchlist.entities) {
		entities.set(wire.entity_id, toEntity(wire));
	}
	return {
		index: new VectorIndex(matrix, ids, watchlist.dim),
		entities,
		version: watchlist.version,
		listId: watchlist.listId,
	};
}

/** True when `value` is a structurally valid catalog entry (fail-closed). */
function isCatalogEntry(value: unknown): value is WatchlistCatalogEntry {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const e = value as Record<string, unknown>;
	return (
		typeof e.id === "string" &&
		typeof e.title === "string" &&
		typeof e.version === "string" &&
		typeof e.path === "string" &&
		typeof e.entitiesCount === "number" &&
		Number.isFinite(e.entitiesCount)
	);
}

/** Validate a parsed catalog fail-closed; throw WatchlistFormatError on any
 * violation (schema!==1, non-array lists, or a malformed entry). Exported so the
 * fail-closed shape contract is unit-testable directly on parsed objects, not
 * only through the (verify-gated) fetch path. */
export function assertCatalogShape(catalog: WatchlistCatalog): void {
	if (catalog.schema !== 1) {
		throw new WatchlistFormatError(
			`catalog schema is ${catalog.schema}; expected 1`,
		);
	}
	if (!Array.isArray(catalog.lists)) {
		throw new WatchlistFormatError("catalog is missing a lists[] array");
	}
	for (const entry of catalog.lists) {
		if (!isCatalogEntry(entry)) {
			throw new WatchlistFormatError(
				`catalog has a malformed list entry: ${JSON.stringify(entry)}`,
			);
		}
	}
}

/**
 * Fetch + verify (fail-closed) the signed catalog, then validate its shape.
 * Verification runs inside fetchVerifiedJson BEFORE parse; the shape check runs
 * after so a forged-but-signed-shape mismatch (wrong schema, non-array lists,
 * missing fields) still aborts the load with no fallback.
 */
export async function fetchVerifiedCatalog(
	pubkey: Uint8Array,
): Promise<WatchlistCatalog> {
	const catalog = await fetchVerifiedJson<WatchlistCatalog>(
		CATALOG_PATH,
		pubkey,
	);
	assertCatalogShape(catalog);
	return catalog;
}

/**
 * Sanity-check an artifact's byte length is plausible for a list of
 * `entitiesCount` entities BEFORE trusting/writing it — defense-in-depth that
 * mirrors decodeVectors' exact byte-length check (a blob far smaller than even
 * the vectors alone, or absurdly large, is rejected fail-closed). The vectors
 * alone are entitiesCount * dim * 4 bytes; a real watchlist is strictly larger
 * (entities JSON + framing). The ceiling guards against a wildly oversized blob.
 */
export function assertPlausibleArtifactSize(
	byteLength: number,
	entitiesCount: number,
): void {
	const minVectorBytes = entitiesCount * EXPECTED_DIM * FLOAT32_BYTES;
	const ceiling = 64 * 1024 + minVectorBytes * 16;
	if (byteLength < minVectorBytes || byteLength > ceiling) {
		throw new WatchlistFormatError(
			`watchlist blob is ${byteLength} bytes; implausible for ${entitiesCount} entities (expected ${minVectorBytes}..${ceiling})`,
		);
	}
}

/**
 * Fetch + verify (fail-closed) a per-list watchlist + its manifest under the
 * catalog entry's dir, cross-check the catalog/manifest/watchlist versions, and
 * build the cosine index + entity map. Any signature/format/skew failure aborts
 * with no fallback.
 */
export async function loadList(
	pubkey: Uint8Array,
	entry: WatchlistCatalogEntry,
): Promise<LoadedWatchlist> {
	const [manifest, watchlist] = await Promise.all([
		fetchVerifiedJson<WatchlistManifest>(
			`watchlist/${entry.path}watchlist.manifest.json`,
			pubkey,
		),
		fetchVerifiedJson<Watchlist>(listWatchlistPath(entry), pubkey),
	]);
	if (
		entry.version !== manifest.version ||
		manifest.version !== watchlist.version
	) {
		throw new WatchlistFormatError(
			`list ${entry.id} version skew: catalog ${entry.version}, manifest ${manifest.version}, watchlist ${watchlist.version}`,
		);
	}
	return buildLoaded(watchlist);
}

/**
 * Fetch + verify (fail-closed) ONLY a per-list manifest and return its version.
 * Cheap version poll for the rescan path: no full list, no vectors decoded.
 */
export async function fetchListVersion(
	pubkey: Uint8Array,
	entry: WatchlistCatalogEntry,
): Promise<string> {
	const manifest = await fetchVerifiedJson<WatchlistManifest>(
		`watchlist/${entry.path}watchlist.manifest.json`,
		pubkey,
	);
	return manifest.version;
}

/** Build a LoadedWatchlist from already-verified, parsed JSON (test seam). */
export function buildLoadedWatchlist(watchlist: Watchlist): LoadedWatchlist {
	return buildLoaded(watchlist);
}
