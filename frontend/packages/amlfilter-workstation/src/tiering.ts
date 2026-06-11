// Match-strength tiers — a faithful port of backend aml_filter/scoring/tiers.py.
// This layers ON TOP of the parity-locked scoring contract: it never alters a
// match's score, reasons, or explanation; it only buckets the final score.
// Parity with the Python source of truth is locked by tiering.parity.test.ts
// against a golden emitted by backend/scripts/gen_tiering_golden.py.

import type { MatchTier } from "./types";

/** Default STRONG band floor (tiers.py:17 STRONG_TIER_FLOOR). */
export const STRONG_TIER_FLOOR = 0.8;

/**
 * Bucket a final match score into a review tier (tiers.py:28 classify_tier).
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
