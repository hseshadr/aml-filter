// The WatchlistSource adapter contract + the shared SourceLine shape.
//
// One adapter per upstream sanctions list (OFAC SDN, EU consolidated, UN
// consolidated, UK OFSI). Each adapter:
//   - fetchRaw(): pulls the raw list bytes off the network (real URLs), returning
//     a map of logical-name -> text (a list may publish more than one file, e.g.
//     OFAC's SDN.CSV + ALT.CSV).
//   - parse(raw, listVersion): maps those raw bytes into the publisher's neutral
//     SourceLine[] shape — fully deterministic, no network — and is the part the
//     fixture tests exercise.
//
// FOUNDATIONAL CROSS-LIST DECISION: every adapter stamps a NAMESPACED entity_id
// of the form `<source_list>:<rawId>` (e.g. "OFAC_SDN:12345",
// "EU_CONSOLIDATED:EU.1234.56"). The raw upstream ids are only unique within a
// single list; prefixing the source_list makes ids globally unique once multiple
// lists are merged into one engine. Use `namespacedId(listId, rawId)` so every
// adapter applies the same rule.

/** The raw bytes a source publishes, keyed by a logical file name.
 * (One list may publish several files, e.g. OFAC's SDN.CSV + ALT.CSV.) */
export type RawListBytes = Record<string, string>;

/** The neutral source record every adapter emits and the publisher consumes.
 * Identical field shape across all lists (this is the OFAC `SourceLine` promoted
 * to the shared contract). */
export interface SourceLine {
	/** Globally unique, namespaced id: `<source_list>:<rawId>`. */
	readonly entity_id: string;
	readonly primary_name: string;
	readonly entity_type: "PERSON" | "ORGANIZATION";
	readonly aliases: readonly { readonly name: string }[];
	readonly dob: readonly string[];
	readonly countries: readonly string[];
	readonly risk_category: string;
	readonly source_list: string;
	readonly list_version: string;
}

/** A publish-time adapter for one upstream sanctions list. */
export interface WatchlistSource {
	/** The list id, also the entity_id namespace (e.g. "OFAC_SDN"). */
	readonly id: string;
	/** Human-readable title for the catalog (e.g. "OFAC SDN"). */
	readonly title: string;
	/** Fetch the raw list bytes off the network (real URLs). */
	fetchRaw(): Promise<RawListBytes>;
	/** Map raw bytes to neutral source lines — deterministic, no network. */
	parse(raw: RawListBytes, listVersion: string): SourceLine[];
}

/** Build the namespaced entity_id every adapter must stamp. */
export function namespacedId(listId: string, rawId: string): string {
	return `${listId}:${rawId}`;
}

/** Canonical list ids (also the entity_id namespaces). */
export const OFAC_LIST_ID = "OFAC_SDN";
export const EU_LIST_ID = "EU_CONSOLIDATED";
export const UN_LIST_ID = "UN_CONSOLIDATED";
export const UK_LIST_ID = "UK_OFSI";
