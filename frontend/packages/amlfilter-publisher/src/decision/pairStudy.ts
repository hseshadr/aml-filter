// The name-similarity study, made runnable.
//
// WHY THIS FILE EXISTS. Two comments in the browser engine quote a measurement
// as justification for a tuned constant:
//
//   engine/scoring.ts   "8,651 real OFAC alias pairs against 9,000 cross-person
//                        pairs — fuzzball token_set_ratio at 0.60 scores 82.8%
//                        recall at a 0.37% false-positive rate"
//   engine/fuzzyText.ts "shared DM key as the decision scores 88.9% recall at a
//                        2.22% false-positive rate — unusable"
//
// The script that produced those numbers was never committed. A number nobody
// can regenerate is not evidence, however plausible it is, so this module
// rebuilds the experiment from the frozen corpus and emits the raw pairs; the
// scoring is `assay`'s, in eval/, like every other number here. Whatever it
// reports becomes the cited figure, and the comments cite this file.
//
// THE EXPERIMENT. Two populations of (name, name) pairs:
//   positive — the primary name of a designation against one of the aliases OFAC
//              publishes for that same designation. Two spellings, one person:
//              the matcher SHOULD call these the same.
//   negative — a published name of one designation against a published name of
//              another, rejected when the two canonical strings share any owner
//              (a name string genuinely shared by both is not a cross-person
//              pair, it is the ambiguity the labels already model).
//
// Two decision rules are scored over both populations: `token_set_ratio >= 0.60`
// (the engine's ALIAS_FUZZY tier) and "the two names share a Double Metaphone
// token key" (the rule the engine refuses to decide with). Reporting them side
// by side is the point — the second is the comparison that makes the first's
// error rate legible.

import {
	canonicalize,
	phoneticKeys,
	tokenSetSimilarity,
	tokenSortSimilarity,
} from "@amlfilter/browser";
import type { OwnerIndex } from "../recall/labels.ts";
import { mulberry32 } from "../recall/sample.ts";
import type { SourceLine } from "../sources/source.ts";

/** One scored pair of names and the two rules' inputs. */
export interface StudyPair {
	readonly kind: "pair";
	/** 1 when the two names belong to the same designation. */
	readonly label: 0 | 1;
	readonly tokenSet: number;
	readonly tokenSort: number;
	readonly sharedPhoneticKey: boolean;
}

/** What the study measured. */
export interface StudyHeader {
	readonly kind: "header";
	readonly schemaVersion: 1;
	readonly measuredAt: string;
	readonly corpus: {
		readonly listId: string;
		readonly entities: number;
		readonly fixtureSha256: string;
	};
	readonly seed: number;
	readonly positives: number;
	readonly negatives: number;
	/** The engine constants under test, so the artifact names its own thresholds. */
	readonly rules: {
		readonly aliasFuzzySetRatio: number;
		readonly aliasFullSortRatio: number;
	};
}

/** Every published name of a designation, canonicalized and de-duplicated. */
function publishedNames(line: SourceLine): readonly string[] {
	const names = [line.primary_name, ...line.aliases.map((a) => a.name)]
		.map(canonicalize)
		.filter((n) => n.length > 0);
	return [...new Set(names)];
}

/** The union of Double Metaphone keys over a canonical name's tokens. */
function keySet(canonical: string): ReadonlySet<string> {
	const keys = new Set<string>();
	for (const token of canonical.split(" ")) {
		for (const key of phoneticKeys(token)) {
			keys.add(key);
		}
	}
	return keys;
}

function sharesKey(a: string, b: string): boolean {
	const left = keySet(a);
	for (const key of keySet(b)) {
		if (left.has(key)) {
			return true;
		}
	}
	return false;
}

/** Score one pair under both rules. */
export function scorePair(a: string, b: string, label: 0 | 1): StudyPair {
	return {
		kind: "pair",
		label,
		tokenSet: tokenSetSimilarity(a, b),
		tokenSort: tokenSortSimilarity(a, b),
		sharedPhoneticKey: sharesKey(a, b),
	};
}

/**
 * Every (primary name, published alias) pair in the snapshot.
 *
 * A designation contributes one pair per alias that canonicalizes differently
 * from its primary name. An alias that canonicalizes to the primary is dropped:
 * it is the same string, so scoring it would report the identity ratio and
 * inflate recall with a case the matcher never has to solve.
 */
export function aliasPairs(lines: readonly SourceLine[]): readonly StudyPair[] {
	const out: StudyPair[] = [];
	for (const line of lines) {
		const [primary, ...aliases] = publishedNames(line);
		if (primary === undefined) {
			continue;
		}
		for (const alias of aliases) {
			out.push(scorePair(primary, alias, 1));
		}
	}
	return out;
}

interface NamedEntity {
	readonly id: string;
	readonly names: readonly string[];
}

function namedEntities(lines: readonly SourceLine[]): readonly NamedEntity[] {
	return lines
		.map((line) => ({ id: line.entity_id, names: publishedNames(line) }))
		.filter((e) => e.names.length > 0);
}

function shareAnOwner(owners: OwnerIndex, a: string, b: string): boolean {
	const left = owners.get(a);
	const right = owners.get(b);
	if (left === undefined || right === undefined) {
		return false;
	}
	for (const id of right) {
		if (left.has(id)) {
			return true;
		}
	}
	return false;
}

function drawCross(
	pool: readonly NamedEntity[],
	owners: OwnerIndex,
	random: () => number,
): StudyPair | null {
	const left = pool[Math.floor(random() * pool.length)] as NamedEntity;
	const right = pool[Math.floor(random() * pool.length)] as NamedEntity;
	if (left.id === right.id) {
		return null;
	}
	const a = left.names[Math.floor(random() * left.names.length)] as string;
	const b = right.names[Math.floor(random() * right.names.length)] as string;
	return shareAnOwner(owners, a, b) ? null : scorePair(a, b, 0);
}

/** Draws allowed per requested negative before the generator gives up. */
const DRAW_BUDGET_PER_PAIR = 50;

/** `count` cross-designation pairs, deterministically from `seed`. */
export function crossPersonPairs(
	lines: readonly SourceLine[],
	owners: OwnerIndex,
	count: number,
	seed: number,
): readonly StudyPair[] {
	const pool = namedEntities(lines);
	const random = mulberry32(seed);
	const out: StudyPair[] = [];
	for (let i = 0; out.length < count && i < count * DRAW_BUDGET_PER_PAIR; i++) {
		const pair = drawCross(pool, owners, random);
		if (pair !== null) {
			out.push(pair);
		}
	}
	if (out.length < count) {
		throw new Error(
			`pair study: produced ${out.length} of ${count} cross-person pairs`,
		);
	}
	return out;
}
