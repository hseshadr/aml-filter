// The live decision, restated for the harness.
//
// This is a mirror of `passesStrictness` + `partitionByConfidence` in
// frontend/app/src/pages/strictness.ts. It exists here because the harness
// cannot import the app package, and it is held honest by
// frontend/app/src/pages/decisionParity.test.ts, which imports BOTH and drives
// them over the same cases — the app's real functions against these. A formula
// that lives in two places and is never compared is the defect this repository
// has already been bitten by; the parity test is the comparison.
//
// Nothing here computes a metric. It answers one question per (query, entity)
// pair — "would the user have been shown this?" — and the answer is emitted as a
// fact. Precision, recall, F1, FPR and FNR are computed downstream, in Python,
// by `assay`.

import { canonicalize, type Match } from "@amlfilter/browser";
import type { DecisionLevel } from "./levels.ts";

/** The signal name the app's lexical gate reads. Wire, not an internal name. */
const LEXICAL_SIGNAL = "name_trigram";

/**
 * The match's lexical signal value, or 0.
 *
 * Mirrors `trigramScore`. The signal is named `name_trigram` on the wire and
 * computes a Ratcliff/Obershelp ratio; see engine/scoring.ts for why the wrong
 * name is knowingly still there.
 */
export function lexicalOf(match: Match): number {
	const reason = match.reasons.find((r) => r.signal === LEXICAL_SIGNAL);
	return typeof reason?.value === "number" ? reason.value : 0;
}

/** Canonical whitespace tokens of a name. Mirrors the app's `nameTokens`. */
function nameTokens(name: string): ReadonlySet<string> {
	const canonical = canonicalize(name);
	return new Set(canonical.length === 0 ? [] : canonical.split(" "));
}

/**
 * True when a canonical query token exactly equals a token of ANY name the
 * entity is published under. Mirrors the app's `hasTokenContainment`, which is
 * the short-keyword escape hatch in the strictness gate.
 */
export function tokenContainmentOf(match: Match, query: string): boolean {
	const queryTokens = nameTokens(query);
	for (const name of [match.primary_name, ...match.aliases]) {
		for (const token of nameTokens(name)) {
			if (queryTokens.has(token)) {
				return true;
			}
		}
	}
	return false;
}

/** The three facts a decision is taken from, extracted once per candidate. */
export interface CandidateFacts {
	readonly score: number;
	readonly lexical: number;
	readonly tokenContainment: boolean;
}

/**
 * Would this candidate have been SHOWN at this level?
 *
 * Two gates, both from the app: the engine's combined-score floor, then the
 * lexical gate with its token escape hatch. A kept match is an alert — it lands
 * in the user's result list and has to be dispositioned.
 */
export function isKept(facts: CandidateFacts, level: DecisionLevel): boolean {
	return (
		facts.score >= level.floor &&
		(facts.lexical >= level.minLexical || facts.tokenContainment)
	);
}

/**
 * Would this candidate have LED as a primary card?
 *
 * `partitionByConfidence` splits kept matches at `displayFloor` (>= is primary).
 * A level with `displayFloor` 0 renders everything primary, so the two bands
 * coincide there — which is why both are reported and never averaged.
 */
export function isPrimary(
	facts: CandidateFacts,
	level: DecisionLevel,
): boolean {
	return isKept(facts, level) && facts.score >= level.displayFloor;
}
