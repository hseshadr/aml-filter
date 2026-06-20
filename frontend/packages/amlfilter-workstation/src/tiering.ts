// Match-strength tiers. This layers ON TOP of the scoring contract: it never
// alters a match's score, reasons, or explanation; it only buckets the final
// score. This TS implementation is the source of truth; tiering.parity.test.ts
// guards it against a FROZEN, committed golden snapshot under __fixtures__ so any
// unintended drift in the tier boundaries or verdicts fails CI.

import type { MatchTier } from "./types";

/** Default STRONG band floor. */
export const STRONG_TIER_FLOOR = 0.8;

/**
 * Bucket a final match score into a review tier.
 * STRONG at/above `strong`; POSSIBLE at/above the policy `possibleThreshold`;
 * WEAK below it. Boundaries are inclusive on the lower edge of each tier.
 */
export function classifyTier(
	score: number,
	possibleThreshold: number,
	strong: number = STRONG_TIER_FLOOR,
): MatchTier {
	if (score >= strong) {
		return "STRONG";
	}
	if (score >= possibleThreshold) {
		return "POSSIBLE";
	}
	return "WEAK";
}
