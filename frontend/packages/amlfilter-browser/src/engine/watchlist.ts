// The watchlist domain shapes + the LoadedWatchlist builders shared across the
// engine. The ONLY load path is the signed, content-addressed BUNDLE (see
// bundleSource.ts): the delta-sync tier reassembles + content-hash-verifies each
// per-list file in the Worker, then hands the raw bytes to
// buildLoadedFromBundleFiles here, which parses the JSONL entities, wraps the
// binary `vectors.f32`, and projects the lean wire entities onto the domain
// Entity shape the scorer + UI consume.
//
// This module owns NO fetch + NO signature verification — trust lives in the
// sync tier (content-hash + the signed `/latest` pointer, fail-closed). What
// remains here is pure: the wire/domain types, the fail-closed shape narrows,
// and the build/project functions (binary bundle path + a base64-JSON test seam
// `buildLoadedWatchlist` the engine's unit tests drive over fixtures).
//
// Wire contract: docs/WATCHLIST_FORMAT.md.

import type { Alias, Entity, EntityType, RiskCategory } from "./domain";
import { canonicalize, normalizeDob } from "./normalize";
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
 * Lift a single wire dob string into the domain Entity's `dob: string[]`,
 * canonicalized to an ISO prefix. An absent or unparseable dob yields [] (no
 * DOB) so the scorer never sees a non-ISO string it would slice a junk year
 * from. Idempotent on already-ISO values.
 */
function normalizeEntityDob(dob: string | null): string[] {
	if (dob === null) {
		return [];
	}
	const iso = normalizeDob(dob);
	return iso !== null ? [iso] : [];
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
 * and lift the dob into the array shape the scorer's dob signal expects. The dob
 * is canonicalized to an ISO prefix via normalizeDob so even a cached/older
 * catalog whose value was not ISO at publish time still matches (the scorer's
 * dob_match assumes ISO + slices [0,4]); idempotent on already-ISO values, and
 * an unparseable value drops to no-DOB rather than reaching the scorer as junk.
 */
function toEntity(wire: WatchlistEntity): Entity {
	return {
		entity_id: wire.entity_id,
		entity_type: DEFAULT_ENTITY_TYPE,
		primary_name: displayName(wire.name_canonical),
		name_canonical: wire.name_canonical,
		aliases: wire.aliases.map(toAlias),
		dob: normalizeEntityDob(wire.dob),
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

/**
 * The shared index + id->Entity build, given the wire entities and an
 * already-decoded Float32 matrix. Both the base64 JSON path ({@link buildLoaded})
 * and the binary bundle path ({@link buildLoadedFromBundleFiles}) funnel through
 * here so the projection — `toEntity`, the row↔id ordering, the VectorIndex
 * construction — is byte-identical, and scoring is therefore identical regardless
 * of how the bytes arrived. Row i of `matrix` is the embedding of
 * `wireEntities[i].name_canonical`; the VectorIndex ctor enforces the same
 * length invariant the byte-length checks already proved.
 */
function buildLoadedFromMatrix(
	wireEntities: ReadonlyArray<WatchlistEntity>,
	matrix: Float32Array,
	dim: number,
	version: string,
	listId: string,
): LoadedWatchlist {
	const ids = wireEntities.map((e) => e.entity_id);
	const entities = new Map<string, Entity>();
	for (const wire of wireEntities) {
		entities.set(wire.entity_id, toEntity(wire));
	}
	return {
		index: new VectorIndex(matrix, ids, dim),
		entities,
		version,
		listId,
	};
}

/** Build the cosine index + id->Entity map from a verified, parsed watchlist. */
function buildLoaded(watchlist: Watchlist): LoadedWatchlist {
	assertWatchlistShape(watchlist);
	const matrix = decodeVectors(
		watchlist.vectors,
		watchlist.dim,
		watchlist.entities.length,
	);
	return buildLoadedFromMatrix(
		watchlist.entities,
		matrix,
		watchlist.dim,
		watchlist.version,
		watchlist.listId,
	);
}

/** Build a LoadedWatchlist from already-verified, parsed JSON (test seam). */
export function buildLoadedWatchlist(watchlist: Watchlist): LoadedWatchlist {
	return buildLoaded(watchlist);
}

/** The per-list `meta.json` the content-addressed bundle stages (mirror of the
 * publisher's BundleListMeta). Carries the version + dim + count the bundle path
 * needs; the version becomes the LoadedWatchlist version (catalog cross-check
 * happens in the runtime, against the bundle catalog entry). */
export interface BundleListMeta {
	readonly listId: string;
	readonly version: string;
	readonly generatedAt: string;
	readonly model: string;
	readonly dim: number;
	readonly entitiesCount: number;
}

/** Narrow a materialized, JSON-parsed bundle meta fail-closed. */
function assertBundleListMeta(value: unknown): asserts value is BundleListMeta {
	if (typeof value !== "object" || value === null) {
		throw new WatchlistFormatError("bundle meta.json is not an object");
	}
	const m = value as Record<string, unknown>;
	if (
		typeof m.listId !== "string" ||
		typeof m.version !== "string" ||
		typeof m.dim !== "number" ||
		typeof m.entitiesCount !== "number" ||
		!Number.isFinite(m.dim) ||
		!Number.isFinite(m.entitiesCount)
	) {
		throw new WatchlistFormatError(
			`bundle meta.json is malformed: ${JSON.stringify(value)}`,
		);
	}
}

/** Narrow a single JSON-parsed entities.jsonl line to a WatchlistEntity. */
function assertWatchlistEntity(
	value: unknown,
	line: number,
): asserts value is WatchlistEntity {
	if (typeof value !== "object" || value === null) {
		throw new WatchlistFormatError(
			`entities.jsonl line ${line} is not an object`,
		);
	}
	const e = value as Record<string, unknown>;
	if (
		typeof e.entity_id !== "string" ||
		typeof e.name_canonical !== "string" ||
		!Array.isArray(e.aliases) ||
		!Array.isArray(e.countries) ||
		typeof e.risk_category !== "string" ||
		typeof e.source_list !== "string" ||
		typeof e.list_version !== "string" ||
		(e.dob !== null && typeof e.dob !== "string")
	) {
		throw new WatchlistFormatError(
			`entities.jsonl line ${line} is a malformed entity`,
		);
	}
}

/** Parse newline-delimited entity JSON (one WatchlistEntity per line, fail-closed
 * on any malformed line). Blank lines (incl. the trailing newline) are skipped. */
function parseEntitiesJsonl(jsonl: string): WatchlistEntity[] {
	const entities: WatchlistEntity[] = [];
	const lines = jsonl.split("\n");
	for (let i = 0; i < lines.length; i += 1) {
		const text = lines[i]?.trim() ?? "";
		if (text.length === 0) {
			continue;
		}
		const parsed: unknown = JSON.parse(text);
		assertWatchlistEntity(parsed, i + 1);
		entities.push(parsed);
	}
	return entities;
}

/** Wrap the raw `vectors.f32` bytes as a Float32Array, validating dim + the row
 * count against the entity count (the binary mirror of decodeVectors' base64
 * check). Copies into a fresh 4-byte-aligned buffer (the materialized bytes may
 * sit at an unaligned byteOffset). */
function decodeVectorBytes(
	bytes: Uint8Array,
	dim: number,
	entityCount: number,
): Float32Array {
	if (bytes.byteLength !== entityCount * dim * FLOAT32_BYTES) {
		throw new WatchlistFormatError(
			`vectors.f32 is ${bytes.byteLength} bytes; expected ${entityCount * dim * FLOAT32_BYTES} (${entityCount} entities * ${dim} dim * ${FLOAT32_BYTES})`,
		);
	}
	return new Float32Array(bytes.slice().buffer);
}

/** The materialized per-list bundle files the bundle path feeds to the builder. */
export interface BundleListFiles {
	/** Raw bytes of `<slug>/entities.jsonl` (one WatchlistEntity JSON per line). */
	readonly entitiesJsonl: Uint8Array;
	/** Raw bytes of `<slug>/vectors.f32` (row-major LE Float32, entities*dim). */
	readonly vectorsF32: Uint8Array;
	/** Raw bytes of `<slug>/meta.json` (the per-list BundleListMeta). */
	readonly meta: Uint8Array;
}

/**
 * Build a LoadedWatchlist from the MATERIALIZED, already-verified per-list bundle
 * files (the content-addressed sync tier reassembles + content-hash-verifies each
 * file before handing the bytes here). The JSONL entities are parsed to the same
 * WatchlistEntity[] the JSON path uses; the raw vectors.f32 bytes are wrapped as
 * a Float32Array with the SAME exact-length check; the SAME projection + index
 * builder runs — so scoring is byte-identical to a JSON-built list of the same
 * data. dim is read from meta.json and pinned to EXPECTED_DIM, fail-closed.
 */
export function buildLoadedFromBundleFiles(
	files: BundleListFiles,
): LoadedWatchlist {
	const meta: unknown = JSON.parse(DECODER.decode(files.meta));
	assertBundleListMeta(meta);
	if (meta.dim !== EXPECTED_DIM) {
		throw new WatchlistFormatError(
			`bundle list ${meta.listId} dim is ${meta.dim}; expected ${EXPECTED_DIM}`,
		);
	}
	const entities = parseEntitiesJsonl(DECODER.decode(files.entitiesJsonl));
	if (entities.length !== meta.entitiesCount) {
		throw new WatchlistFormatError(
			`bundle list ${meta.listId}: entities.jsonl has ${entities.length} lines; meta.json says ${meta.entitiesCount}`,
		);
	}
	const matrix = decodeVectorBytes(files.vectorsF32, meta.dim, entities.length);
	return buildLoadedFromMatrix(
		entities,
		matrix,
		meta.dim,
		meta.version,
		meta.listId,
	);
}
