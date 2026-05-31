// TS mirror of the aml-filter backend domain contract — the SAME shapes the
// native (Python) screening path produces, so the in-browser screen returns a
// byte-compatible SearchResponse. Single source of truth for the browser tier.
//
// Backend originals:
//   - Entity / Alias       -> aml_filter/domain/entity.py
//   - SearchQuery          -> aml_filter/domain/search.py
//   - Match / MatchReason  -> aml_filter/domain/search.py
//   - SearchResponse       -> aml_filter/domain/search.py
//   - OfacBundleMeta       -> aml_filter/bundle/meta.py

/** PERSON or ORGANIZATION — the only entity types OFAC screening recognizes. */
export type EntityType = "PERSON" | "ORGANIZATION";

/** The risk bucket a matched entity falls in. */
export type RiskCategory = "SANCTION" | "PEP" | "CUSTOM" | "WHITELIST";

/** One known alias for an entity (mirrors backend Alias). */
export interface Alias {
	readonly name: string;
	readonly name_canonical: string;
	readonly source: string;
}

/**
 * One screened entity, exactly as one line of `entities.jsonl`. Only the fields
 * the browser screen reads are typed here; unknown extras (raw_source, etc.)
 * are tolerated by structural typing.
 */
export interface Entity {
	readonly entity_id: string;
	readonly entity_type: EntityType;
	readonly primary_name: string;
	readonly name_canonical: string;
	readonly aliases: ReadonlyArray<Alias>;
	/** ISO date strings (YYYY-MM-DD), matching Pydantic's JSON date encoding. */
	readonly dob: ReadonlyArray<string>;
	/** ISO 3166-1 alpha-2 country codes. */
	readonly countries: ReadonlyArray<string>;
	readonly risk_category: RiskCategory;
	readonly source_list: string;
	readonly list_version: string;
}

/** Typed metadata for one published OFAC bundle (`ofac_meta.json`). */
export interface OfacBundleMeta {
	readonly list_id: string;
	readonly version: string;
	readonly entity_count: number;
	readonly embedding_model: string;
	readonly embedding_dim: number;
}

/** A screening query — the browser-tier mirror of the backend SearchQuery. */
export interface ScreenQuery {
	readonly name: string;
	/** ISO date string (YYYY-MM-DD), or null when not supplied. */
	readonly dob?: string | null;
	/** ISO 3166-1 alpha-2, or null. */
	readonly country?: string | null;
	readonly entityType?: EntityType | null;
	/** Score floor a match must clear (defaults to the preset threshold). */
	readonly threshold?: number;
	/** Max matches to return. */
	readonly k?: number;
}

/** One explanation reason for a match (mirrors backend MatchReason). */
export interface MatchReason {
	readonly signal: string;
	readonly value: number | string;
	readonly weight: number | null;
	readonly contribution: number | null;
	readonly description: string | null;
}

/** A matched entity with score and explanation (mirrors backend Match). */
export interface Match {
	readonly entity_id: string;
	readonly score: number;
	readonly risk_category: RiskCategory;
	readonly source_list: string;
	readonly list_version: string;
	readonly primary_name: string;
	readonly aliases: ReadonlyArray<string>;
	readonly countries: ReadonlyArray<string>;
	readonly dob: ReadonlyArray<string>;
	readonly reasons: ReadonlyArray<MatchReason>;
	readonly explanation: string;
}

/** Response from in-browser screening (mirrors backend SearchResponse). */
export interface ScreenResponse {
	readonly request_id: string;
	readonly matches: ReadonlyArray<Match>;
	readonly list_versions_used: Readonly<Record<string, string>>;
	readonly execution_time_ms: number;
}
