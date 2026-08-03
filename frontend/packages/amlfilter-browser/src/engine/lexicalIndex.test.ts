import { describe, expect, it } from "vitest";
import type { Alias, Entity } from "./domain";
import {
	LexicalIndex,
	MAX_DOCUMENT_FREQUENCY_RATIO,
	MAX_LEXICAL_CANDIDATES,
} from "./lexicalIndex";
import { canonicalize } from "./normalize";

function alias(name: string): Alias {
	return { name, name_canonical: canonicalize(name), source: "" };
}

function entity(
	id: string,
	primary: string,
	aliases: readonly string[] = [],
): Entity {
	return {
		entity_id: id,
		entity_type: "PERSON",
		primary_name: primary,
		name_canonical: canonicalize(primary),
		aliases: aliases.map(alias),
		dob: [],
		countries: [],
		risk_category: "SANCTION",
		source_list: "OFAC_SDN",
		list_version: "v1",
	};
}

function indexOf(entities: readonly Entity[]): LexicalIndex {
	return LexicalIndex.build(new Map(entities.map((e) => [e.entity_id, e])));
}

const CORPUS: readonly Entity[] = [
	entity("e_zawahiri", "AL ZAWAHIRI, Dr. Ayman", [
		"AL-ZAWAHIRI, Ayman",
		"SALIM, Ahmad Fuad",
	]),
	entity("e_marzook", "ABU MARZOOK, Mousa Mohammed", ["MARZUK, Musa Abu"]),
	entity("e_nasrallah", "NASRALLAH, Hasan", []),
	entity("e_acme", "Acme Trading Company Limited", []),
];

describe("LexicalIndex — what it indexes", () => {
	it("indexes alias names, not just the primary name", () => {
		// "salim" exists only inside an alias. Before aliases were indexed there
		// was nothing in retrieval that knew this string at all.
		expect(indexOf(CORPUS).candidates("salim")).toEqual(["e_zawahiri"]);
	});

	it("finds an entity by a literal token shared with one of its names", () => {
		expect(indexOf(CORPUS).candidates("musa abu marzuk")).toContain(
			"e_marzook",
		);
	});

	it("finds an entity through a shared pronunciation when no token matches", () => {
		// "aiman" is not a token of any indexed name; it reaches Ayman only via
		// the shared Double-Metaphone key.
		const index = indexOf(CORPUS);
		expect(index.candidates("aiman")).toEqual(["e_zawahiri"]);
	});

	it("returns nothing for a query that shares neither token nor sound", () => {
		expect(indexOf(CORPUS).candidates("zzyzx nobody")).toEqual([]);
	});

	it("ignores empty tokens and an empty query", () => {
		expect(indexOf(CORPUS).candidates("")).toEqual([]);
		expect(indexOf(CORPUS).candidates("  ")).toEqual([]);
	});

	it("lists each entity once however many of its names share a token", () => {
		// "al zawahiri ayman" and "al zawahiri ayman" (the alias) both carry
		// "zawahiri"; the posting list must not repeat the id.
		expect(indexOf(CORPUS).candidates("zawahiri")).toEqual(["e_zawahiri"]);
	});

	it("skips an entity whose names are all blank rather than indexing empties", () => {
		const blank = entity("e_blank", "");
		const index = indexOf([...CORPUS, blank]);
		expect(index.candidates("")).toEqual([]);
		expect(index.candidates("acme")).not.toContain("e_blank");
	});
});

describe("LexicalIndex — the document-frequency cutoff", () => {
	/** N entities that all share the token "company", plus one that does not. */
	function crowded(n: number): readonly Entity[] {
		const many = Array.from({ length: n }, (_, i) =>
			entity(`e_co_${i}`, `Company Number ${i}`),
		);
		return [...many, entity("e_rare", "Zzyzx Holdings")];
	}

	it("derives the cutoff from the list size and the declared ratio", () => {
		const index = indexOf(crowded(999));
		expect(index.maxDocumentFrequency).toBe(
			Math.ceil(1000 * MAX_DOCUMENT_FREQUENCY_RATIO),
		);
	});

	it("never drops below a cutoff of 1, so a tiny list still retrieves", () => {
		expect(indexOf([entity("e_one", "Solo")]).maxDocumentFrequency).toBe(1);
		expect(indexOf([entity("e_one", "Solo")]).candidates("solo")).toEqual([
			"e_one",
		]);
	});

	it("SKIPS a token held by more entities than the cutoff allows", () => {
		// "company" is in 999 of 1000 entities — far over the 1% cutoff — so it
		// contributes nothing. "number" is in the same 999 and is skipped too.
		expect(indexOf(crowded(999)).candidates("company")).toEqual([]);
	});

	it("still retrieves through a rare token in the same query", () => {
		const index = indexOf(crowded(999));
		expect(index.candidates("zzyzx company")).toEqual(["e_rare"]);
	});
});

describe("LexicalIndex — the candidate cap", () => {
	/** Enough same-token entities to exceed the cap without tripping the cutoff. */
	function overflowing(): readonly Entity[] {
		const n = MAX_LEXICAL_CANDIDATES + 50;
		// The list is large enough that df(shared token) stays under the 1% cutoff
		// only if the list is ~100x the cap; instead give each entity its own rare
		// token AND a shared phonetic-free token by padding the corpus.
		const filler = Array.from({ length: n * 100 }, (_, i) =>
			entity(`e_filler_${i}`, `Filler ${i}`),
		);
		const hits = Array.from({ length: n }, (_, i) =>
			entity(`e_hit_${String(i).padStart(4, "0")}`, `Nasrallah Person${i}`),
		);
		return [...filler, ...hits];
	}

	it("returns at most MAX_LEXICAL_CANDIDATES ids", () => {
		const found = indexOf(overflowing()).candidates("nasrallah hasan");
		expect(found).toHaveLength(MAX_LEXICAL_CANDIDATES);
	});

	it("keeps the closest spellings when it truncates, not the first indexed", () => {
		const corpus = [...overflowing(), entity("e_exact", "Nasrallah Hasan")];
		const found = indexOf(corpus).candidates("nasrallah hasan");
		expect(found).toHaveLength(MAX_LEXICAL_CANDIDATES);
		// The exact name is indexed LAST, so insertion order would have dropped it.
		expect(found).toContain("e_exact");
	});

	it("returns the same ids in the same order on a repeat query", () => {
		const index = indexOf(overflowing());
		expect(index.candidates("nasrallah hasan")).toEqual(
			index.candidates("nasrallah hasan"),
		);
	});
});

describe("LexicalIndex — shape", () => {
	it("reports how many distinct tokens and phonetic keys it holds", () => {
		const index = indexOf(CORPUS);
		expect(index.tokenCount).toBeGreaterThan(0);
		expect(index.phoneticKeyCount).toBeGreaterThan(0);
		// Phonetics collapse spellings, so there are never more keys than tokens.
		expect(index.phoneticKeyCount).toBeLessThanOrEqual(index.tokenCount);
	});
});
