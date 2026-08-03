// Lexical + phonetic candidate generation — the half of retrieval the vector
// index cannot do.
//
// THE PROBLEM THIS EXISTS TO SOLVE. The vector index takes the top k*2 (≈40) of
// 19,181 rows by raw MiniLM cosine, with no floor. Every scoring signal then
// only ever sees those survivors, so an entity at cosine rank 51 is invisible
// no matter what it would have scored. Worse, the vectors are built from each
// entity's PRIMARY name only: an alias string like "SALIM, Ahmad Fuad" is
// present in the bundle but nothing retrieves by it. Measured against the frozen
// OFAC SDN corpus at the parameters /screen sends, 39% of alias queries returned
// the right entity NOWHERE.
//
// WHAT THIS DOES. Two inverted indexes over every entity's canonical primary
// name AND every alias's canonical name:
//
//   canonical token          -> entity ids
//   Double-Metaphone key     -> entity ids
//
// Candidate generation is then a handful of hash lookups, not a scan. The
// screening engine unions these ids with the vector top-k and scores the whole
// union through the unchanged scoring path.
//
// WHY IT MUST BE BOUNDED. Posting lists are wildly uneven. On the real corpus
// "company" appears in 3,208 entities and "limited" in 2,562; the phonetic key
// `KMPN` holds 3,257. Unioning those would hand the scorer thousands of
// candidates whose only connection to the query is a word that carries no
// identity at all. Two named bounds below, both measured, neither guessed.

import type { Entity } from "./domain";
import { phoneticKeys, tokenSetSimilarity } from "./fuzzyText";

/**
 * Skip any token or phonetic key held by more than this fraction of the list.
 *
 * Range 0.001–0.05. At 0.01 on the 19,181-entity OFAC SDN corpus the cutoff is
 * df > 192, and what it actually removes is legal boilerplate and language
 * particles: company (3,208), limited (2,562), liability (1,284), ltd (1,182),
 * co (1,001), llc (964), joint (919), stock (908), and (883), obshchestvo (705),
 * de (681), ooo (668) — 40 of 34,716 distinct tokens, carrying 22.7% of all
 * postings. Nothing discriminating is lost: matching on "company" tells you
 * nothing about WHICH company. Raising it toward 0.05 quadruples the candidate
 * set for no measured recall gain; lowering it below 0.005 starts discarding
 * real surnames.
 */
export const MAX_DOCUMENT_FREQUENCY_RATIO = 0.01;

/**
 * Hard ceiling on candidates handed to the scorer from this index.
 *
 * Range 100–2000. Measured over 2,000 sampled alias queries against the real
 * corpus at the cutoff above: mean 122 candidates, p50 104, p90 272, p99 490,
 * max 688. 600 therefore truncates under 1% of queries while capping the worst
 * case at roughly five times the median — the cap is reachable (so it is
 * testable) without being the common path. Overflow is ranked by fuzzball
 * token_set_ratio against the entity's best-matching name, so what survives
 * truncation is what a human would call the closest spelling, not whichever
 * entity the feed happened to list first.
 */
export const MAX_LEXICAL_CANDIDATES = 600;

/** Every canonical name an entity is published under: its own, plus its aliases. */
function namesOf(entity: Entity): readonly string[] {
	const names = new Set<string>();
	if (entity.name_canonical.length > 0) {
		names.add(entity.name_canonical);
	}
	for (const alias of entity.aliases) {
		if (alias.name_canonical.length > 0) {
			names.add(alias.name_canonical);
		}
	}
	return [...names];
}

function push(index: Map<string, string[]>, key: string, id: string): void {
	const existing = index.get(key);
	if (existing === undefined) {
		index.set(key, [id]);
	} else if (existing[existing.length - 1] !== id) {
		// Names of the same entity share tokens constantly ("musa abu marzuk" and
		// "musa abu marzook"); ids arrive grouped, so comparing the tail is enough
		// to keep each posting list free of duplicates.
		existing.push(id);
	}
}

/** Candidate entity ids for a query, by token and by pronunciation. */
export class LexicalIndex {
	readonly #byToken: ReadonlyMap<string, readonly string[]>;
	readonly #byPhonetic: ReadonlyMap<string, readonly string[]>;
	readonly #namesById: ReadonlyMap<string, readonly string[]>;
	readonly #maxDocumentFrequency: number;

	private constructor(
		byToken: ReadonlyMap<string, readonly string[]>,
		byPhonetic: ReadonlyMap<string, readonly string[]>,
		namesById: ReadonlyMap<string, readonly string[]>,
		maxDocumentFrequency: number,
	) {
		this.#byToken = byToken;
		this.#byPhonetic = byPhonetic;
		this.#namesById = namesById;
		this.#maxDocumentFrequency = maxDocumentFrequency;
	}

	/** Index every entity's primary name and every alias name. Build-time O(tokens). */
	public static build(entities: ReadonlyMap<string, Entity>): LexicalIndex {
		const byToken = new Map<string, string[]>();
		const byPhonetic = new Map<string, string[]>();
		const namesById = new Map<string, readonly string[]>();
		for (const [id, entity] of entities) {
			const names = namesOf(entity);
			namesById.set(id, names);
			for (const name of names) {
				for (const token of name.split(" ")) {
					if (token.length === 0) {
						continue;
					}
					push(byToken, token, id);
					for (const key of phoneticKeys(token)) {
						push(byPhonetic, key, id);
					}
				}
			}
		}
		return new LexicalIndex(
			byToken,
			byPhonetic,
			namesById,
			Math.max(1, Math.ceil(entities.size * MAX_DOCUMENT_FREQUENCY_RATIO)),
		);
	}

	/** The df above which a posting list is skipped, for this list's size. */
	public get maxDocumentFrequency(): number {
		return this.#maxDocumentFrequency;
	}

	/** Distinct canonical tokens indexed (primary names and aliases together). */
	public get tokenCount(): number {
		return this.#byToken.size;
	}

	/** Distinct Double-Metaphone keys indexed. */
	public get phoneticKeyCount(): number {
		return this.#byPhonetic.size;
	}

	/**
	 * Candidate entity ids for an already-canonicalized query. Deterministic:
	 * posting lists are in feed order and the overflow ranking breaks ties by id.
	 */
	public candidates(queryCanonical: string): readonly string[] {
		const hits = new Set<string>();
		for (const token of new Set(queryCanonical.split(" "))) {
			if (token.length === 0) {
				continue;
			}
			this.#collect(this.#byToken.get(token), hits);
			for (const key of phoneticKeys(token)) {
				this.#collect(this.#byPhonetic.get(key), hits);
			}
		}
		return hits.size <= MAX_LEXICAL_CANDIDATES
			? [...hits]
			: this.#closest(queryCanonical, hits);
	}

	#collect(posting: readonly string[] | undefined, out: Set<string>): void {
		if (posting === undefined || posting.length > this.#maxDocumentFrequency) {
			return;
		}
		for (const id of posting) {
			out.add(id);
		}
	}

	/** The best token_set_ratio between the query and any name this entity has. */
	#similarity(queryCanonical: string, id: string): number {
		let best = 0;
		for (const name of this.#namesById.get(id) ?? []) {
			best = Math.max(best, tokenSetSimilarity(queryCanonical, name));
		}
		return best;
	}

	#closest(
		queryCanonical: string,
		hits: ReadonlySet<string>,
	): readonly string[] {
		const scored = [...hits].map((id) => ({
			id,
			score: this.#similarity(queryCanonical, id),
		}));
		scored.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
		return scored.slice(0, MAX_LEXICAL_CANDIDATES).map((s) => s.id);
	}
}
