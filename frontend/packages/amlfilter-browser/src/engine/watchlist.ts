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
import type { Alias, Entity, EntityType } from "./domain";
import { canonicalize } from "./normalize";
import { VectorIndex } from "./vectorIndex";

/** all-MiniLM-L6-v2 embedding dimension; the only dim the engine accepts. */
const EXPECTED_DIM = 384;
const FLOAT32_BYTES = 4;
/** Entity type assumed when the lean wire record omits it (scorer signal only). */
const DEFAULT_ENTITY_TYPE: EntityType = "PERSON";

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
 * Fetch a signed file + its detached `.sig`, verify FAIL-CLOSED against the
 * pinned key over the EXACT file bytes, then parse the JSON. Verify runs BEFORE
 * parse so unverified bytes never reach JSON.parse. The url is resolved relative
 * to `document.baseURI` so it is always same-origin with the SPA.
 */
async function fetchVerifiedJson<T>(
	relativePath: string,
	pubkey: Uint8Array,
): Promise<T> {
	const url = new URL(relativePath, document.baseURI).toString();
	const [bytes, signature] = await Promise.all([
		fetchFileBytes(url),
		fetchSignature(`${url}.sig`),
	]);
	await verifyEd25519(pubkey, bytes, signature);
	return JSON.parse(DECODER.decode(bytes)) as T;
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
		risk_category: wire.risk_category as Entity["risk_category"],
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

/**
 * Fetch + verify (fail-closed) ONLY the tiny manifest and return its version.
 * Cheap version poll for the step-5 rescan: no full list, no vectors decoded.
 */
export async function fetchWatchlistVersion(
	pubkey: Uint8Array,
): Promise<string> {
	const manifest = await fetchVerifiedJson<WatchlistManifest>(
		"watchlist/watchlist.manifest.json",
		pubkey,
	);
	return manifest.version;
}

/**
 * Fetch + verify (fail-closed) the watchlist + its manifest, decode the vectors,
 * and build the cosine index + entity map. Any signature/format failure aborts
 * with no fallback. The manifest is verified too so a manifest/list version
 * skew (or a forged manifest) is caught on load, not only at poll time.
 */
export async function loadWatchlist(
	pubkey: Uint8Array,
): Promise<LoadedWatchlist> {
	const [manifest, watchlist] = await Promise.all([
		fetchVerifiedJson<WatchlistManifest>(
			"watchlist/watchlist.manifest.json",
			pubkey,
		),
		fetchVerifiedJson<Watchlist>("watchlist/watchlist.json", pubkey),
	]);
	if (manifest.version !== watchlist.version) {
		throw new WatchlistFormatError(
			`manifest version ${manifest.version} != watchlist version ${watchlist.version}`,
		);
	}
	return buildLoaded(watchlist);
}

/** Build a LoadedWatchlist from already-verified, parsed JSON (test seam). */
export function buildLoadedWatchlist(watchlist: Watchlist): LoadedWatchlist {
	return buildLoaded(watchlist);
}
