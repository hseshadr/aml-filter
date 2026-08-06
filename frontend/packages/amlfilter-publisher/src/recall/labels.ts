// Labelled retrieval queries, derived from the sanctions feed's OWN structure.
//
// OFAC publishes, for each designated entity, the other names that entity is
// known by. Every published alias is therefore a known-true spelling variant of
// a known parent — thousands of (query, expected-entity) pairs that already
// exist in the data. No human labelling, and — critically — no involvement from
// the thing being measured: a label the ranker helped choose would make the
// measurement circular and it would score well by construction.
//
// Two segments, never averaged together:
//   - "alias":     query = a published alias, expected = the entity that owns it.
//                  This is the product's actual promise (find the entity whose
//                  name is spelled differently).
//   - "canonical": query = the entity's own primary name, expected = itself.
//                  The floor case. If this is not ~1.0 the index is broken in a
//                  way that has nothing to do with fuzzy matching, so mixing it
//                  into one average would mask exactly the failure that matters.
//
// AMBIGUITY: a name string can legitimately belong to more than one designation
// (25 canonical primary names are shared in the current OFAC list, and aliases
// collide more often). The label is therefore a SET of acceptable entity ids —
// every entity for which that canonical string is a primary name or a published
// alias — and a query counts as answered when ANY of them is retrieved. Scoring
// a shared name against one arbitrarily-chosen owner would report a miss for a
// correct answer.

import { canonicalize } from "@amlfilter/browser";
import type { SourceLine } from "../sources/source.ts";

/** Which segment a labelled query belongs to. Reported separately, never merged. */
export type QueryKind = "alias" | "canonical";

/** One query and every entity that is a correct answer for it. */
export interface LabelledQuery {
	/** The raw text screened, exactly as the feed published it. */
	readonly query: string;
	/** `canonicalize(query)` — the de-duplication key and the label key. */
	readonly canonical: string;
	readonly kind: QueryKind;
	/** Entity ids that legitimately answer this query (non-empty). */
	readonly expected: ReadonlySet<string>;
}

/** The labelled queries, split into the two segments. */
export interface LabelledQuerySet {
	readonly alias: readonly LabelledQuery[];
	readonly canonical: readonly LabelledQuery[];
}

/**
 * Every entity id that publishes `canonical` as a primary name or an alias.
 *
 * Exported because the decision harness needs exactly this index for two things
 * the recall harness does not do: rejecting a generated negative that turns out
 * to be a real published name, and deciding whether a returned entity is a
 * legitimate answer or a collision (../decision/negatives, ../decision/emit).
 */
export type OwnerIndex = ReadonlyMap<string, ReadonlySet<string>>;

function addOwner(
	owners: Map<string, Set<string>>,
	canonical: string,
	entityId: string,
): void {
	if (canonical.length === 0) {
		return;
	}
	const existing = owners.get(canonical);
	if (existing === undefined) {
		owners.set(canonical, new Set([entityId]));
		return;
	}
	existing.add(entityId);
}

/** Index every canonical name string in the feed to the entities that publish it. */
export function buildOwnerIndex(lines: readonly SourceLine[]): OwnerIndex {
	const owners = new Map<string, Set<string>>();
	for (const line of lines) {
		addOwner(owners, canonicalize(line.primary_name), line.entity_id);
		for (const alias of line.aliases) {
			addOwner(owners, canonicalize(alias.name), line.entity_id);
		}
	}
	return owners;
}

function labelFor(
	owners: OwnerIndex,
	query: string,
	canonical: string,
	kind: QueryKind,
): LabelledQuery | null {
	const expected = owners.get(canonical);
	if (expected === undefined || expected.size === 0) {
		return null;
	}
	return { query, canonical, kind, expected };
}

/** Collect one segment's queries, keeping the first raw spelling per canonical. */
function collectSegment(
	owners: OwnerIndex,
	raw: readonly { readonly query: string; readonly canonical: string }[],
	kind: QueryKind,
): LabelledQuery[] {
	const seen = new Set<string>();
	const out: LabelledQuery[] = [];
	for (const { query, canonical } of raw) {
		if (canonical.length === 0 || seen.has(canonical)) {
			continue;
		}
		seen.add(canonical);
		const labelled = labelFor(owners, query, canonical, kind);
		if (labelled !== null) {
			out.push(labelled);
		}
	}
	return out;
}

/** Raw canonical-name queries: one per entity, its own primary name. */
function canonicalCandidates(
	lines: readonly SourceLine[],
): { readonly query: string; readonly canonical: string }[] {
	return lines.map((line) => ({
		query: line.primary_name,
		canonical: canonicalize(line.primary_name),
	}));
}

/**
 * Raw alias queries. An alias that canonicalizes to its own entity's primary
 * name is dropped: it is the same string the index was built from, so it tests
 * exact lookup, not the spelling-variant promise this segment exists to measure.
 */
function aliasCandidates(
	lines: readonly SourceLine[],
): { readonly query: string; readonly canonical: string }[] {
	const out: { query: string; canonical: string }[] = [];
	for (const line of lines) {
		const primary = canonicalize(line.primary_name);
		for (const alias of line.aliases) {
			const canonical = canonicalize(alias.name);
			if (canonical.length > 0 && canonical !== primary) {
				out.push({ query: alias.name, canonical });
			}
		}
	}
	return out;
}

/**
 * Derive the labelled query set from parsed feed lines. Deterministic: the
 * output order follows the feed's own order, so the same fixture always yields
 * the same queries in the same sequence.
 */
export function buildLabelledQueries(
	lines: readonly SourceLine[],
): LabelledQuerySet {
	const owners = buildOwnerIndex(lines);
	return {
		alias: collectSegment(owners, aliasCandidates(lines), "alias"),
		canonical: collectSegment(owners, canonicalCandidates(lines), "canonical"),
	};
}
