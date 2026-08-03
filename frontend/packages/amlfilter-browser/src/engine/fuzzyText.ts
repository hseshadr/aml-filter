// The ONE file in this package that imports `fuzzball` and `double-metaphone`.
//
// Everything else in the engine calls the two functions below. Upgrading,
// renaming or replacing either library is a change to this file and nothing
// else — if a swap ever forces edits elsewhere, the seam is wrong, not the
// caller.
//
// WHY THESE TWO
//
// fuzzball (2.2.6, 2026-04-30, MIT) is the reference JavaScript port of the
// fuzzywuzzy API. There is no official RapidFuzz binding for JS or WASM — the
// rapidfuzz organisation ships Python, C++ and Rust only, and the obvious npm
// names are unclaimed. RapidFuzz is itself a drop-in for fuzzywuzzy, so
// fuzzball's `token_set_ratio` semantics match the Python reference the field
// validates against. Its weak axis is provenance: one maintainer, not an
// institution. There is no institutional JS alternative; the ones that exist are
// stale (talisman, 2021), deprecated (string-similarity), not browser-safe
// (natural pulls mongoose), or dormant (fastest-levenshtein, 2022).
//
// The `/lite` entry is imported deliberately. The FULL entry inlines
// `require("util")` and breaks inside a Worker, which is exactly where this
// engine runs.
//
// double-metaphone (2.0.1, wooorm/words org, zero deps, ~2 KB gz) is frozen by
// construction: the algorithm has not changed since 2000, so its 2022 publish
// date is feature-completeness, not abandonment.
//
// WHAT PHONETICS ARE FOR, AND WHAT THEY ARE NOT FOR
//
// Double Metaphone is a RECALL SIGNAL here — never a match decision and never a
// sole blocker. Measured on this repository's own OFAC data: 5,281 real SDN
// surnames collapse into a shared key 52.5% of the time (the `ST` bucket holds
// SAYED, SOTO, ZADEH, SAAD and SADEGHI at once), and on 8,651 real alias pairs
// vs 9,000 cross-person pairs, "shared DM key" as the decision scores 88.9%
// recall at a 2.22% false-positive rate — unusable. As a blocker it is just as
// wrong in the other direction: it discards ~11% of true matches, and it splits
// consonant variants that are obviously the same name (Zawahiri `SHR` vs
// Zawahri `SR`). What it does well is collapse vowel variants — Muhammad /
// Mohammed / Mohamad all key to `MHMT`, Qaddafi / Gaddafi / Khadafy to `KTF`.
// Chinese romanisation is a total loss (Zhang and Chang split).
//
// So: phonetics WIDEN the candidate pool. The score still decides.

import { doubleMetaphone } from "double-metaphone";
import { token_set_ratio, token_sort_ratio } from "fuzzball/lite";

/** fuzzball reports similarity on 0–100; the engine speaks in 0–1. */
const FUZZBALL_SCALE = 100;

/**
 * The Double Metaphone keys for one token: the primary key, plus the secondary
 * when the algorithm produced a different one (it emits two for names whose
 * pronunciation is genuinely ambiguous across languages — "MARZUK" keys to both
 * `MRSK` and `MRTSK`). Empty for a token with no pronounceable letters.
 */
export function phoneticKeys(token: string): readonly string[] {
	if (token.length === 0) {
		return [];
	}
	const [primary, secondary] = doubleMetaphone(token);
	if (primary.length === 0) {
		return [];
	}
	return secondary.length > 0 && secondary !== primary
		? [primary, secondary]
		: [primary];
}

/**
 * fuzzball `token_set_ratio` in [0, 1] — word-order-insensitive similarity that
 * also tolerates one side carrying extra words ("Musa Abu Marzook" vs "Musa
 * Muhammad Abu Marzuk"). Inputs are expected already canonical (lowercase, no
 * punctuation), so fuzzball's own pre-processing is switched off rather than run
 * a second, differently-specified normalizer over them.
 */
export function tokenSetSimilarity(a: string, b: string): number {
	if (a.length === 0 || b.length === 0) {
		return 0;
	}
	return token_set_ratio(a, b, { full_process: false }) / FUZZBALL_SCALE;
}

/**
 * fuzzball `token_sort_ratio` in [0, 1] — the words sorted, then compared whole.
 *
 * The difference from {@link tokenSetSimilarity} is the one that matters here:
 * token_SET ignores extra words on one side, so "Vladimir Ivanov" against
 * "Vladimir Ivanov II" scores a perfect 1.0 and the II is erased. token_SORT
 * keeps every word in the comparison, so it drops to ~0.91 — different people
 * stay different. Order still does not matter, which is the point: "SALIM,
 * Ahmad Fuad" and "Ahmad Fuad Salim" are one name written two ways once
 * canonicalization has removed the comma that carried the convention.
 */
export function tokenSortSimilarity(a: string, b: string): number {
	if (a.length === 0 || b.length === 0) {
		return 0;
	}
	return token_sort_ratio(a, b, { full_process: false }) / FUZZBALL_SCALE;
}
