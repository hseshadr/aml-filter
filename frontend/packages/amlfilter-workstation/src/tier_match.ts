// The single Match -> TieredMatch mapping, shared by onboarding and rescan so
// the two screening paths can never drift in how they tier or denormalize a
// hit. It layers ON the parity-locked scoring contract: it copies the score,
// reasons, and explanation verbatim and only buckets the score into a tier.

import type { Match } from "@amlfilter/browser";
import { classifyTier } from "./tiering";
import type { TieredMatch } from "./types";

/** Map an engine Match to a persistable TieredMatch at the given POSSIBLE floor. */
export function tierMatch(
	match: Match,
	possibleThreshold: number,
): TieredMatch {
	return {
		ofac_entity_id: match.entity_id,
		score: match.score,
		tier: classifyTier(match.score, possibleThreshold),
		sanctioned_name: match.primary_name,
		source_list: match.source_list,
		list_version: match.list_version,
		reasons: [...match.reasons],
		explanation: match.explanation,
	};
}
