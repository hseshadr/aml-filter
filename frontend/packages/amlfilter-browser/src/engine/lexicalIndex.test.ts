import { describe, expect, it } from "vitest";
import type { Alias, Entity } from "./domain";
import {
	LexicalIndex,
	lexicalKeysForEntity,
	MAX_DOCUMENT_FREQUENCY_RATIO,
	MAX_LEXICAL_CANDIDATES,
} from "./lexicalIndex";
import { canonicalize } from "./normalize";
import { VectorIndex } from "./vectorIndex";

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
	const byId = new Map(entities.map((item) => [item.entity_id, item]));
	const vectors = new VectorIndex(
		new Float32Array(entities.length),
		entities.map((item) => item.entity_id),
		1,
		undefined,
		(id) => {
			const item = byId.get(id);
			return item === undefined ? [] : lexicalKeysForEntity(item);
		},
	);
	return LexicalIndex.build(vectors, byId);
}

const CORPUS: readonly Entity[] = [
	entity("e_zawahiri", "AL ZAWAHIRI, Dr. Ayman", [
		"AL-ZAWAHIRI, Ayman",
		"SALIM, Ahmad Fuad",
	]),
	entity("e_marzook", "ABU MARZOOK, Mousa Mohammed", ["MARZUK, Musa Abu"]),
	entity("e_nasrallah", "NASRALLAH, Hasan"),
	entity("e_acme", "Acme Trading Company Limited"),
];

describe("LexicalIndex — SQLite keyed lookup", () => {
	it("persists primary and alias token/phonetic keys", () => {
		const keys = lexicalKeysForEntity(CORPUS[0] as Entity);
		expect(keys).toContainEqual({ namespace: "token", value: "salim" });
		expect(keys.some((key) => key.namespace === "phonetic")).toBe(true);
	});

	it("retrieves an alias-only entity", async () => {
		await expect(indexOf(CORPUS).candidates("salim")).resolves.toEqual([
			"e_zawahiri",
		]);
	});

	it("retrieves a literal-token match", async () => {
		await expect(
			indexOf(CORPUS).candidates("musa abu marzuk"),
		).resolves.toContain("e_marzook");
	});

	it("retrieves through Double Metaphone when no token matches", async () => {
		await expect(indexOf(CORPUS).candidates("aiman")).resolves.toEqual([
			"e_zawahiri",
		]);
	});

	it("returns nothing without a shared token or pronunciation", async () => {
		await expect(indexOf(CORPUS).candidates("zzyzx nobody")).resolves.toEqual(
			[],
		);
	});

	it("ignores empty tokens and deduplicates an entity across aliases", async () => {
		await expect(indexOf(CORPUS).candidates("  ")).resolves.toEqual([]);
		await expect(indexOf(CORPUS).candidates("zawahiri")).resolves.toEqual([
			"e_zawahiri",
		]);
	});
});

describe("LexicalIndex — bounded retrieval", () => {
	function crowded(n: number): readonly Entity[] {
		const many = Array.from({ length: n }, (_, i) =>
			entity(`e_co_${i}`, `Company Number ${i}`),
		);
		return [...many, entity("e_rare", "Zzyzx Holdings")];
	}

	it("derives a minimum-one document-frequency cutoff", () => {
		expect(indexOf(crowded(999)).maxDocumentFrequency).toBe(
			Math.ceil(1000 * MAX_DOCUMENT_FREQUENCY_RATIO),
		);
		expect(indexOf([entity("e_one", "Solo")]).maxDocumentFrequency).toBe(1);
	});

	it("lets SQLite skip over-common postings but keeps rare keys", async () => {
		const index = indexOf(crowded(999));
		await expect(index.candidates("company")).resolves.toEqual([]);
		await expect(index.candidates("zzyzx company")).resolves.toEqual([
			"e_rare",
		]);
	});

	function overflowing(): readonly Entity[] {
		const n = MAX_LEXICAL_CANDIDATES + 50;
		const filler = Array.from({ length: n * 100 }, (_, i) =>
			entity(`e_filler_${i}`, `Filler ${i}`),
		);
		const hits = Array.from({ length: n }, (_, i) =>
			entity(`e_hit_${String(i).padStart(4, "0")}`, `Nasrallah Person${i}`),
		);
		return [...filler, ...hits];
	}

	it("caps overflow and keeps the closest spelling deterministically", async () => {
		const index = indexOf([
			...overflowing(),
			entity("e_exact", "Nasrallah Hasan"),
		]);
		const first = await index.candidates("nasrallah hasan");
		const second = await index.candidates("nasrallah hasan");
		expect(first).toHaveLength(MAX_LEXICAL_CANDIDATES);
		expect(first).toContain("e_exact");
		expect(second).toEqual(first);
	});
});

// Retrieval provenance: which lexical channel(s) reached an entity. It is a
// SEPARATE read beside `candidates` — it must never change what `candidates`
// returns or in what order, and it never feeds the score.
describe("LexicalIndex — retrieval provenance", () => {
	it("labels a sound-alike reached only through Double Metaphone as phonetic", async () => {
		const provenance = await indexOf(CORPUS).provenance("aiman");
		expect([...provenance.token]).toEqual([]);
		expect([...provenance.phonetic]).toEqual(["e_zawahiri"]);
	});

	it("labels a literal token hit as token (and phonetic when its sound also matches)", async () => {
		const provenance = await indexOf(CORPUS).provenance("salim");
		expect([...provenance.token]).toEqual(["e_zawahiri"]);
		expect(provenance.phonetic.has("e_zawahiri")).toBe(true);
	});

	it("reaches nothing for a name sharing neither token nor sound", async () => {
		const provenance = await indexOf(CORPUS).provenance("zzyzx nobody");
		expect(provenance.token.size).toBe(0);
		expect(provenance.phonetic.size).toBe(0);
	});

	it("applies the same per-key document-frequency cap as candidates", async () => {
		const many = Array.from({ length: 999 }, (_, i) =>
			entity(`e_co_${i}`, `Company Number ${i}`),
		);
		const index = indexOf([...many, entity("e_rare", "Zzyzx Holdings")]);
		const common = await index.provenance("company");
		expect(common.token.size).toBe(0);
		expect(common.phonetic.size).toBe(0);
		const rare = await index.provenance("zzyzx company");
		expect([...rare.token]).toEqual(["e_rare"]);
	});

	it.each([
		"aiman",
		"salim",
		"musa abu marzuk",
		"hasan nasrallah",
		"zawahiri",
		"acme trading",
	])("partitions exactly the candidate set for %j", async (query) => {
		const index = indexOf(CORPUS);
		const candidates = await index.candidates(query);
		const provenance = await index.provenance(query);
		const union = new Set([...provenance.token, ...provenance.phonetic]);
		expect([...union].sort()).toEqual([...candidates].sort());
	});

	it("leaves candidates byte-for-byte unchanged", async () => {
		const index = indexOf(CORPUS);
		const before = await index.candidates("musa abu marzuk hasan");
		await index.provenance("musa abu marzuk hasan");
		expect(await index.candidates("musa abu marzuk hasan")).toEqual(before);
	});
});
