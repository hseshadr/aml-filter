// TS port of aml_filter.scoring.policy.DefaultScoringPolicy.compute_score plus
// the preset weights/threshold (aml_filter.scoring.config). Produces the SAME
// explainable shape the backend returns: a list of weighted MatchSignals, a
// clamped total score, and a plain-language summary. Pure + deterministic.

import type { Alias, Entity, MatchReason } from "./domain";

/** The named weights for the five scoring signals (mirrors ScoringWeights). */
export interface ScoringWeights {
	readonly name_vector: number;
	readonly name_trigram: number;
	readonly alias_match: number;
	readonly dob_match: number;
	readonly country_match: number;
}

/** Weights + threshold for one named preset. */
export interface PresetConfig {
	readonly weights: ScoringWeights;
	readonly threshold: number;
}

/** The preset name (mirrors the backend's Literal). */
export type Preset = "strict" | "balanced" | "lenient";

/** Preset weights/threshold, byte-for-byte from aml_filter.scoring.config. */
export const PRESETS: Readonly<Record<Preset, PresetConfig>> = {
	strict: {
		weights: {
			name_vector: 0.6,
			name_trigram: 0.25,
			alias_match: 0.05,
			dob_match: 0.05,
			country_match: 0.05,
		},
		threshold: 0.75,
	},
	balanced: {
		weights: {
			name_vector: 0.55,
			name_trigram: 0.2,
			alias_match: 0.1,
			dob_match: 0.1,
			country_match: 0.05,
		},
		threshold: 0.65,
	},
	lenient: {
		weights: {
			name_vector: 0.5,
			name_trigram: 0.15,
			alias_match: 0.15,
			dob_match: 0.1,
			country_match: 0.1,
		},
		threshold: 0.55,
	},
};

const STRONG_SIMILARITY_THRESHOLD = 0.8;
const DOB_HALF_MATCH_THRESHOLD = 0.5;

/** The result of scoring one (entity, query) pair. */
export interface ScoreResult {
	readonly score: number;
	readonly reasons: ReadonlyArray<MatchReason>;
	readonly summary: string;
}

/** The query fields scoring reads (canonical name precomputed by the caller). */
export interface ScoringQuery {
	readonly nameCanonical: string;
	readonly dob: string | null;
	readonly country: string | null;
	readonly entityType: string | null;
	readonly vectorSimilarity: number;
	readonly trigramSimilarity: number;
}

interface Accumulator {
	readonly reasons: MatchReason[];
	total: number;
}

function isStrong(similarity: number | null): boolean {
	return similarity !== null && similarity > STRONG_SIMILARITY_THRESHOLD;
}

function addWeighted(
	acc: Accumulator,
	name: string,
	score: number,
	weight: number,
	description: string,
	valueOverride?: number | string,
): void {
	const contribution = weight * score;
	acc.reasons.push({
		signal: name,
		value: valueOverride ?? score,
		weight,
		contribution,
		description,
	});
	acc.total += contribution;
}

function aliasMatch(
	aliases: ReadonlyArray<Alias>,
	queryCanonical: string,
): { readonly score: number; readonly name: string | null } {
	const query = queryCanonical.toLowerCase();
	// Score EVERY alias, not just the first that partially hits. An exact alias
	// anywhere is a full (1.0) match and must never be shadowed by an earlier
	// SUBSTRING alias (which only earns 0.5) — that shadowing silently dropped an
	// exact-alias-only entity to a half score and, near the threshold, out of the
	// results entirely (a false clear). The first partial's name is retained so a
	// partial-only entity scores exactly as before; an exact hit returns
	// immediately, since nothing can beat 1.0.
	let best: { readonly score: number; readonly name: string | null } = {
		score: 0.0,
		name: null,
	};
	for (const alias of aliases) {
		const aliasLower = alias.name_canonical.toLowerCase();
		if (query === aliasLower) {
			return { score: 1.0, name: alias.name };
		}
		if (
			best.score < 0.5 &&
			(aliasLower.includes(query) || query.includes(aliasLower))
		) {
			best = { score: 0.5, name: alias.name };
		}
	}
	return best;
}

function dobMatch(
	dobs: ReadonlyArray<string>,
	queryDob: string | null,
): { readonly score: number; readonly desc: string } {
	if (queryDob === null || dobs.length === 0) {
		return { score: 0.0, desc: "No DOB provided or entity has no DOB" };
	}
	const queryYear = queryDob.slice(0, 4);
	for (const dob of dobs) {
		if (dob === queryDob) {
			return { score: 1.0, desc: `Exact DOB match: ${dob}` };
		}
		if (dob.slice(0, 4) === queryYear) {
			return { score: 0.5, desc: `Year match: ${queryYear}` };
		}
	}
	return { score: 0.0, desc: "No DOB match" };
}

function countryMatch(
	countries: ReadonlyArray<string>,
	queryCountry: string | null,
): { readonly score: number; readonly desc: string } {
	if (queryCountry === null || countries.length === 0) {
		return {
			score: 0.0,
			desc: "No country provided or entity has no countries",
		};
	}
	const queryUpper = queryCountry.toUpperCase();
	const entityUpper = new Set(countries.map((c) => c.toUpperCase()));
	if (!entityUpper.has(queryUpper)) {
		return {
			score: 0.0,
			desc: `No country match: ${queryUpper} not in ${formatCountrySet(entityUpper)}`,
		};
	}
	if (entityUpper.size === 1) {
		return { score: 1.0, desc: `Exact country match: ${queryUpper}` };
	}
	return {
		score: 1.0 / entityUpper.size,
		desc: `Country match: ${queryUpper} in ${formatCountrySet(entityUpper)}`,
	};
}

// Render a country set as a sorted, bracketed list. Sorted (not insertion order)
// so it is deterministic and byte-matches the Python source of truth, which
// renders the same form via aml_filter.scoring.policy._format_country_set.
function formatCountrySet(countries: ReadonlySet<string>): string {
	return `[${[...countries].sort().join(", ")}]`;
}

function summarize(
	finalScore: number,
	vectorSimilarity: number,
	trigramSimilarity: number,
	aliasScore: number,
	dobScore: number,
	countryScore: number,
): string {
	const parts: string[] = [];
	if (isStrong(vectorSimilarity)) {
		parts.push("strong vector similarity");
	}
	if (isStrong(trigramSimilarity)) {
		parts.push("strong name match");
	}
	if (aliasScore > 0) {
		parts.push("alias match");
	}
	if (dobScore >= DOB_HALF_MATCH_THRESHOLD) {
		parts.push("DOB match");
	}
	if (countryScore > 0) {
		parts.push("country match");
	}
	if (parts.length > 0) {
		return `Match due to: ${parts.join(", ")}`;
	}
	return `Low confidence match (score: ${finalScore.toFixed(3)})`;
}

function addNameSignals(
	acc: Accumulator,
	weights: ScoringWeights,
	q: ScoringQuery,
): void {
	addWeighted(
		acc,
		"name_vector",
		q.vectorSimilarity,
		weights.name_vector,
		`Vector similarity: ${q.vectorSimilarity.toFixed(3)}`,
	);
	addWeighted(
		acc,
		"name_trigram",
		q.trigramSimilarity,
		weights.name_trigram,
		`Trigram similarity: ${q.trigramSimilarity.toFixed(3)}`,
	);
}

function addEntityTypeSignal(
	acc: Accumulator,
	entity: Entity,
	queryEntityType: string | null,
): void {
	const desc =
		queryEntityType === null
			? "No entity type specified in query"
			: entity.entity_type.toUpperCase() === queryEntityType.toUpperCase()
				? `Entity type match: ${entity.entity_type}`
				: `Entity type mismatch: ${entity.entity_type} != ${queryEntityType}`;
	const score =
		queryEntityType !== null &&
		entity.entity_type.toUpperCase() === queryEntityType.toUpperCase()
			? 1.0
			: 0.0;
	acc.reasons.push({
		signal: "entity_type_match",
		value: score,
		weight: 0.0,
		contribution: 0.0,
		description: desc,
	});
}

/** Compute (score, reasons, summary) for one (entity, query) pair. */
export function computeScore(
	entity: Entity,
	query: ScoringQuery,
	weights: ScoringWeights,
): ScoreResult {
	const acc: Accumulator = { reasons: [], total: 0 };
	addNameSignals(acc, weights, query);

	const alias = aliasMatch(entity.aliases, query.nameCanonical);
	if (alias.score > 0) {
		addWeighted(
			acc,
			"alias_match",
			alias.score,
			weights.alias_match,
			alias.name !== null ? `Alias match: ${alias.name}` : "No alias match",
			alias.name ?? "",
		);
	}

	const dob = dobMatch(entity.dob, query.dob);
	if (dob.score > 0 || query.dob !== null) {
		addWeighted(acc, "dob_match", dob.score, weights.dob_match, dob.desc);
	}

	const country = countryMatch(entity.countries, query.country);
	if (country.score > 0 || query.country !== null) {
		addWeighted(
			acc,
			"country_match",
			country.score,
			weights.country_match,
			country.desc,
		);
	}

	addEntityTypeSignal(acc, entity, query.entityType);
	const finalScore = Math.max(0.0, Math.min(1.0, acc.total));
	return {
		score: finalScore,
		reasons: acc.reasons,
		summary: summarize(
			finalScore,
			query.vectorSimilarity,
			query.trigramSimilarity,
			alias.score,
			dob.score,
			country.score,
		),
	};
}
