// The negatives: queries that must NOT produce an alert.
//
// A false-positive rate needs names that are not on the list. Where they come
// from decides whether the number means anything, so the construction is spelled
// out here rather than buried in a script.
//
// TWO POPULATIONS, NEVER POOLED. `clean-hard` is built here by recombining real
// list tokens (100% token overlap — the adversarial upper bound). `clean-plain`
// is built from ./plainNames (0% token overlap — the ordinary-customer lower
// bound). Both are measured; neither is "the" false-positive rate. The first
// saturates by construction, which is why the second exists: a rate pinned at 1.0
// is a gate that cannot fail.
//
// WHAT IS BUILT (clean-hard). Every negative is a RECOMBINATION of two different designations
// in the same frozen snapshot: the leading name element of one, the trailing name
// element of another. ("Recombination", not "given name + surname" — OFAC prints
// surname-first for some entries and not others, and canonicalization drops the
// comma that carried the convention, so the harness does not claim to know which
// element is which.) A candidate is kept only when its canonical form is NOT a
// primary name or a published alias of ANY entity in the snapshot, checked
// against the same owner index the positive labels are derived from.
//
// WHY THIS AND NOT SOMETHING EASIER. Every token in a negative is a token the
// sanctions list itself publishes. That is deliberately the hardest case this
// product faces: the lexical gate's short-keyword escape hatch fires on
// whole-token equality, so a recombined name walks straight past it, and the
// alias tiers see real alias vocabulary. A negative set of ordinary customer
// names with no token overlap would clear every gate trivially and report a
// flattering false-positive rate that describes nothing.
//
// WHAT THE NUMBER THEREFORE IS. A PESSIMISTIC BOUND, not a production estimate.
// A real screening population is mostly names with no token overlap with any
// sanctions list; this set has 100% token overlap by construction. Read the
// measured FPR as "the rate under adversarial input", and do not quote it as the
// rate a bank would see.
//
// WHAT IT DOES NOT COVER, stated plainly:
//   - ordinary names with no token overlap (the common real-world case);
//   - non-Latin scripts, transliteration families, and corporate name suffixes;
//   - DOB or country disambiguation — every query here is name-only, exactly as
//     the /screen page's default (empty DOB field) sends it;
//   - whether a recombined name belongs to a real person who is sanctioned under
//     an entry this snapshot does not carry. The label is "not on THIS list", not
//     "not sanctioned".

import { canonicalize } from "@amlfilter/browser";
import type { OwnerIndex } from "../recall/labels.ts";
import { mulberry32 } from "../recall/sample.ts";
import type { SourceLine } from "../sources/source.ts";
import { PLAIN_FAMILY_NAMES, PLAIN_GIVEN_NAMES } from "./plainNames.ts";

/** One generated negative: a name with no entity behind it in this snapshot. */
export interface CleanQuery {
	readonly query: string;
	readonly canonical: string;
}

/**
 * How many draws to allow per requested negative before giving up. Generous —
 * most rejections are cheap duplicates — but bounded, so a corpus that cannot
 * produce the requested count fails loudly instead of spinning.
 */
const DRAW_BUDGET_PER_QUERY = 200;

/** Canonical name tokens of a designation, or `null` when it has fewer than two. */
function recombinableTokens(line: SourceLine): readonly string[] | null {
	const tokens = canonicalize(line.primary_name).split(" ").filter(Boolean);
	return tokens.length >= 2 ? tokens : null;
}

/** The designations eligible to donate a name element. */
function donors(lines: readonly SourceLine[]): readonly (readonly string[])[] {
	const out: (readonly string[])[] = [];
	for (const line of lines) {
		if (line.entity_type !== "PERSON") {
			continue;
		}
		const tokens = recombinableTokens(line);
		if (tokens !== null) {
			out.push(tokens);
		}
	}
	return out;
}

function pick(
	pool: readonly (readonly string[])[],
	random: () => number,
): readonly string[] {
	return pool[Math.floor(random() * pool.length)] as readonly string[];
}

/** One draw, or null when the pair is degenerate or lands on a real name. */
function draw(
	pool: readonly (readonly string[])[],
	owners: OwnerIndex,
	random: () => number,
): CleanQuery | null {
	const lead = pick(pool, random);
	const tail = pick(pool, random);
	const head = lead[0] as string;
	const last = tail[tail.length - 1] as string;
	if (lead === tail || head === last) {
		return null;
	}
	const canonical = canonicalize(`${head} ${last}`);
	return owners.has(canonical) ? null : { query: canonical, canonical };
}

/**
 * Generate `count` negatives, deterministically from `seed`.
 *
 * Throws rather than returning a short set: a gate measured on fewer negatives
 * than it asked for is a gate whose denominator moved silently.
 */
export function buildCleanQueries(
	lines: readonly SourceLine[],
	owners: OwnerIndex,
	count: number,
	seed: number,
): readonly CleanQuery[] {
	const pool = donors(lines);
	if (pool.length < 2) {
		throw new Error(
			"negatives: corpus has fewer than two recombinable persons",
		);
	}
	const random = mulberry32(seed);
	const seen = new Set<string>();
	const out: CleanQuery[] = [];
	for (
		let i = 0;
		out.length < count && i < count * DRAW_BUDGET_PER_QUERY;
		i++
	) {
		const candidate = draw(pool, owners, random);
		if (candidate !== null && !seen.has(candidate.canonical)) {
			seen.add(candidate.canonical);
			out.push(candidate);
		}
	}
	if (out.length < count) {
		throw new Error(
			`negatives: produced ${out.length} of ${count} requested unique names`,
		);
	}
	return out;
}

/** Every whole canonical token that appears in ANY name the snapshot publishes. */
export function buildTokenIndex(
	lines: readonly SourceLine[],
): ReadonlySet<string> {
	const tokens = new Set<string>();
	for (const line of lines) {
		for (const name of [
			line.primary_name,
			...line.aliases.map((a) => a.name),
		]) {
			for (const token of canonicalize(name).split(" ")) {
				if (token.length > 0) {
					tokens.add(token);
				}
			}
		}
	}
	return tokens;
}

/** A plain candidate survives only with zero token overlap and no owner. */
function plainDraw(
	given: string,
	family: string,
	owners: OwnerIndex,
	listTokens: ReadonlySet<string>,
): CleanQuery | null {
	if (listTokens.has(given) || listTokens.has(family)) {
		return null;
	}
	const canonical = canonicalize(`${given} ${family}`);
	return owners.has(canonical) ? null : { query: canonical, canonical };
}

/**
 * `count` ordinary names with ZERO token overlap with the list — the control
 * group (see ./plainNames). Deterministic from `seed`, and it throws rather than
 * quietly shrinking the denominator.
 */
export function buildPlainQueries(
	lines: readonly SourceLine[],
	owners: OwnerIndex,
	count: number,
	seed: number,
): readonly CleanQuery[] {
	const listTokens = buildTokenIndex(lines);
	const random = mulberry32(seed);
	const seen = new Set<string>();
	const out: CleanQuery[] = [];
	for (
		let i = 0;
		out.length < count && i < count * DRAW_BUDGET_PER_QUERY;
		i++
	) {
		const given = PLAIN_GIVEN_NAMES[
			Math.floor(random() * PLAIN_GIVEN_NAMES.length)
		] as string;
		const family = PLAIN_FAMILY_NAMES[
			Math.floor(random() * PLAIN_FAMILY_NAMES.length)
		] as string;
		const candidate = plainDraw(given, family, owners, listTokens);
		if (candidate !== null && !seen.has(candidate.canonical)) {
			seen.add(candidate.canonical);
			out.push(candidate);
		}
	}
	if (out.length < count) {
		throw new Error(
			`negatives: produced ${out.length} of ${count} requested plain names; ` +
				"the vocabulary in ./plainNames may have too much overlap with this corpus",
		);
	}
	return out;
}
