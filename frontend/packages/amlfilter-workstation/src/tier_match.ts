// The single Match -> TieredMatch mapping, shared by onboarding and rescan so
// the two screening paths can never drift in how they tier, denormalize, or
// fingerprint a hit. It layers ON the parity-locked scoring contract: it copies
// the score, reasons, and explanation verbatim, buckets the score into a tier,
// and computes the material-change fingerprint from the customer profile + the
// entity's identity-bearing fields (name/aliases/dob/countries).

import { canonicalize, type Match } from "@amlfilter/browser";
import { materialFingerprint } from "./fingerprint";
import { classifyTier } from "./tiering";
import type { TieredMatch } from "./types";

/** The customer half of the fingerprint — the screened identity. */
export interface CustomerProfile {
	readonly name_canonical: string;
	readonly country: string | null;
}

/**
 * Build the fingerprint profile from a raw screened name + country, canonicalizing
 * the name with the SAME normalizer the engine uses so the customer half is
 * computed consistently across onboarding and rescan.
 */
export function canonicalProfile(
	name: string,
	country: string | null,
): CustomerProfile {
	return { name_canonical: canonicalize(name), country };
}

/** Map an engine Match to a persistable TieredMatch at the given POSSIBLE floor. */
export function tierMatch(
	match: Match,
	profile: CustomerProfile,
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
		material_fingerprint: materialFingerprint(profile, {
			name_canonical: match.primary_name,
			aliases: match.aliases,
			dob: match.dob,
			countries: match.countries,
		}),
	};
}
