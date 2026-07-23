// The /screen search-layer strictness contract: three named levels (Lenient /
// Balanced / Strict), the lexical gate that hides embedding noise, and the
// confidence partition that decides which KEPT matches lead as primary cards.
// Pure and deterministic — ScreenPage is the only runtime consumer; unit tests
// drive this module directly.
//
// Explainable-scoring standard: every threshold is a NAMED constant with a
// declared range and a written justification. This layer is presentation-side
// calibration only — it never touches the parity-locked scoring contract, and
// it never DROPS a match the engine returned (recall preserved).

import { canonicalize, type Match } from "@amlfilter/browser";

// How closely a name must match to surface as a search hit. The embedder gives
// any two short names a ~0.45 baseline cosine, so the combined-score `floor`
// alone lets vector noise through; the `minLexical` gate (on the discriminating
// name_trigram signal) is what actually hides it. Defaults to Balanced.
// Floors/minLexicals were tuned against the real trigram data.
export type Strictness = "lenient" | "balanced" | "strict";

export interface StrictnessLevel {
	readonly level: Strictness;
	/** Passed to engine.screen as the combined-score `threshold`. Range 0–1. */
	readonly floor: number;
	/** Minimum name_trigram a match must clear (unless a token matches). Range 0–1. */
	readonly minLexical: number;
	/**
	 * Combined-score line below which a KEPT match renders grouped under the
	 * collapsed low-confidence disclosure instead of as a primary match card.
	 * Range 0–1; matches exactly AT the line are primary (>= semantics), and 0
	 * disables grouping entirely (every match renders primary). Presentation
	 * only: grouped matches stay in the results and remain fully inspectable.
	 */
	readonly displayFloor: number;
}

/**
 * The Balanced low-confidence display line. A Balanced result below this line
 * passed the search gate (floor 0.30 + lexical/token check) but is too weak to
 * lead with: scores in the 0.30–0.40 band are mostly embedding-baseline fuzz
 * (live example: "Zzyzx Nobody" surfaced candidates at 0.32–0.36). 0.40 is the
 * SAME line Strict already uses as its engine floor, so both levels share one
 * definition of "confident enough to present as a match". Range 0–1; must stay
 * above Balanced's 0.30 floor — that gap is exactly the band the disclosure
 * groups. Raising it hides more as low-confidence; lowering it toward 0.30
 * restores the old everything-is-a-card behavior.
 */
export const BALANCED_LOW_CONFIDENCE_LINE = 0.4;

// The visible per-level labels live in screen.json under `strictness.levels.*`,
// keyed by `level`; the control renders them with t() at their button.
// Typed as a fixed 3-tuple (not ReadonlyArray) so the LEVEL lookup below is
// provably exhaustive — indexing [0]/[1]/[2] cannot be undefined.
export const STRICTNESS_LEVELS: readonly [
	StrictnessLevel,
	StrictnessLevel,
	StrictnessLevel,
] = [
	// Lenient is the show-everything level: no lexical gate, no display line.
	{ level: "lenient", floor: 0.3, minLexical: 0.0, displayFloor: 0.0 },
	// Balanced keeps Lenient's recall floor but leads only with confident scores.
	{
		level: "balanced",
		floor: 0.3,
		minLexical: 0.35,
		displayFloor: BALANCED_LOW_CONFIDENCE_LINE,
	},
	// Strict's ENGINE floor (0.40) already refuses everything under the line, so
	// a display line would be dead code; 0 keeps its classic all-primary render.
	{ level: "strict", floor: 0.4, minLexical: 0.5, displayFloor: 0.0 },
];

export const LEVEL: Readonly<Record<Strictness, StrictnessLevel>> = {
	lenient: STRICTNESS_LEVELS[0],
	balanced: STRICTNESS_LEVELS[1],
	strict: STRICTNESS_LEVELS[2],
};

/** The match's name_trigram signal value (the discriminating lexical signal), or 0. */
function trigramScore(match: Match): number {
	const reason = match.reasons.find((r) => r.signal === "name_trigram");
	return typeof reason?.value === "number" ? reason.value : 0;
}

/** Canonical whitespace tokens of a name, mirroring the engine's trigram canonicalization. */
function nameTokens(name: string): ReadonlySet<string> {
	const canonical = canonicalize(name);
	return new Set(canonical.length === 0 ? [] : canonical.split(" "));
}

/** True when any canonical query token exactly equals a canonical entity-name token. */
function hasTokenContainment(match: Match, query: string): boolean {
	const entityTokens = nameTokens(match.primary_name);
	for (const token of nameTokens(query)) {
		if (entityTokens.has(token)) {
			return true;
		}
	}
	return false;
}

/**
 * The search-layer gate: keep a match when its trigram clears the level's
 * minLexical, OR a query token exactly matches an entity name token (the
 * short-keyword escape hatch, e.g. "bank" vs a long org name).
 */
export function passesStrictness(
	match: Match,
	query: string,
	level: StrictnessLevel,
): boolean {
	return (
		trigramScore(match) >= level.minLexical || hasTokenContainment(match, query)
	);
}

/** The presentation split of the kept matches for one level. */
export interface ConfidencePartition {
	readonly primary: ReadonlyArray<Match>;
	readonly lowConfidence: ReadonlyArray<Match>;
}

/**
 * Split kept matches at the level's display line, preserving engine rank order
 * on both sides and dropping nothing. `score >= displayFloor` renders as a
 * primary card; the rest render grouped under the low-confidence disclosure.
 * With `displayFloor` 0 this is the identity split (all primary).
 */
export function partitionByConfidence(
	matches: ReadonlyArray<Match>,
	level: StrictnessLevel,
): ConfidencePartition {
	return {
		primary: matches.filter((m) => m.score >= level.displayFloor),
		lowConfidence: matches.filter((m) => m.score < level.displayFloor),
	};
}
