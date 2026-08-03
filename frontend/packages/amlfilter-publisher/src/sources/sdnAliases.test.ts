// Non-Latin alias enrichment, proven against REAL Treasury bytes.
//
// fixtures/sources/sdn_advanced_slice.xml holds four verbatim <DistinctParty>
// blocks lifted out of OFAC's own SDN_ADVANCED.XML (plus its <ScriptValues>
// reference set): 9760 (Cyrillic), 2677 (Arabic), 16806 (Cyrillic rendering of
// a Latin org name) and 36 (Latin only — the negative case).
//
// The point of this suite is NOT the alias count. It is the last test: a
// CYRILLIC QUERY THAT RETURNS THE RIGHT ENTITY. A count is shape; a successful
// match is the property.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	canonicalize,
	computeScore,
	type Entity,
	PRESETS,
	type RiskCategory,
} from "@amlfilter/browser";
import { afterEach, describe, expect, test, vi } from "vitest";
import { parseCslSdn } from "./csl.ts";
import {
	AliasFeedTooLargeError,
	applyAliasEnrichment,
	fetchNonLatinAliases,
	LATIN_SCRIPT,
	NO_ENRICHMENT,
	parseNonLatinAliases,
	parseNonLatinAliasesFromStream,
	SDN_ALIAS_MIRROR_URL,
} from "./sdnAliases.ts";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES = resolve(HERE, "../../fixtures/sources");

const xml = (): Promise<string> =>
	readFile(resolve(FIXTURES, "sdn_advanced_slice.xml"), "utf8");
const csl = (): Promise<string> =>
	readFile(resolve(FIXTURES, "csl_consolidated.csv"), "utf8");

/** Lukashenko's Cyrillic name exactly as OFAC publishes it. */
const LUKASHENKA_CYRILLIC = "Лукашэнка Аляксандр Рыгоравiч";

describe("parseNonLatinAliases over real SDN_ADVANCED bytes", () => {
	test("reads the script names from the file's OWN reference set", async () => {
		// Never hardcode "215 means Latin" — the file says so itself.
		expect(LATIN_SCRIPT).toBe("Latin");
	});

	test("keys aliases by FixedRef — the id CSL joins on", async () => {
		const found = parseNonLatinAliases(await xml());
		expect([...found.byEntityNumber.keys()].sort()).toEqual([
			"16806",
			"2677",
			"9760",
		]);
	});

	test("captures the Cyrillic name CSL drops", async () => {
		const found = parseNonLatinAliases(await xml());
		expect(found.byEntityNumber.get("9760")).toContain(LUKASHENKA_CYRILLIC);
	});

	test("captures Arabic too", async () => {
		const found = parseNonLatinAliases(await xml());
		const arabic = found.byEntityNumber.get("2677") ?? [];
		expect(arabic.length).toBeGreaterThan(0);
		expect(arabic.some((n) => /[؀-ۿ]/.test(n))).toBe(true);
	});

	test("takes NOTHING from a Latin-only entity", async () => {
		const found = parseNonLatinAliases(await xml());
		// 36 = AEROCARIBBEAN AIRLINES: Latin only. Enrichment must not invent
		// aliases, and must not duplicate names CSL already carries.
		expect(found.byEntityNumber.has("36")).toBe(false);
	});

	test("counts what it took, by script", async () => {
		const found = parseNonLatinAliases(await xml());
		expect(found.byScript.get("Cyrillic")).toBeGreaterThan(0);
		expect(found.byScript.get("Arabic")).toBeGreaterThan(0);
		expect(found.byScript.has("Latin")).toBe(false);
		expect(found.aliasesFound).toBe(
			[...found.byEntityNumber.values()].reduce((n, a) => n + a.length, 0),
		);
	});
});

describe("applyAliasEnrichment", () => {
	test("appends the non-Latin aliases to the matching record only", async () => {
		const lines = parseCslSdn(await csl(), "2026-07-30");
		const result = applyAliasEnrichment(
			lines,
			parseNonLatinAliases(await xml()),
		);

		const byId = new Map(result.lines.map((l) => [l.entity_id, l]));
		const lukashenka = byId.get("OFAC_SDN:9760");
		expect(lukashenka?.aliases.map((a) => a.name)).toContain(
			LUKASHENKA_CYRILLIC,
		);
		// The Latin aliases CSL supplied are still there — enrich, never replace.
		expect(lukashenka?.aliases.map((a) => a.name)).toContain(
			"LUKASHENKO, Aleksandr Grigorevich",
		);
		// An untouched record keeps exactly what CSL gave it.
		const aero = byId.get("OFAC_SDN:36");
		expect(aero?.aliases).toEqual([{ name: "AERO-CARIBBEAN" }]);
		expect(result.aliasesAdded).toBeGreaterThan(0);
		expect(result.entitiesEnriched).toBeGreaterThan(0);
	});

	test("never duplicates an alias the record already had", async () => {
		const lines = parseCslSdn(await csl(), "2026-07-30");
		const enrichment = parseNonLatinAliases(await xml());
		const once = applyAliasEnrichment(lines, enrichment);
		// Applying twice must be idempotent — a re-run cannot inflate the list.
		const twice = applyAliasEnrichment(once.lines, enrichment);
		expect(twice.aliasesAdded).toBe(0);
		for (const line of twice.lines) {
			const names = line.aliases.map((a) => a.name);
			expect(new Set(names).size).toBe(names.length);
		}
	});

	test("is a no-op when enrichment is empty (the fail-soft path)", async () => {
		const lines = parseCslSdn(await csl(), "2026-07-30");
		const result = applyAliasEnrichment(lines, {
			byEntityNumber: new Map(),
			aliasesFound: 0,
			byScript: new Map(),
		});
		expect(result.aliasesAdded).toBe(0);
		expect(result.lines).toEqual(lines);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// THE POINT OF THE WHOLE CHANGE.
//
// Before enrichment a Cyrillic query cannot reach Lukashenko: CSL publishes only
// transliterated Latin aliases, and canonicalize() PRESERVES Cyrillic (it folds
// diacritics and lowercases, it does not transliterate), so nothing in the
// record can equal the query. After enrichment the exact-alias rule fires.
// ─────────────────────────────────────────────────────────────────────────────
describe("a Cyrillic query returns the right entity", () => {
	// Vector and trigram similarity are pinned at 0 so NOTHING but the alias rule
	// can produce a match. If this test goes green, it went green because a
	// Cyrillic string in the record equalled the Cyrillic string in the query.
	const query = {
		nameCanonical: canonicalize(LUKASHENKA_CYRILLIC),
		dob: null,
		country: null,
		entityType: null,
		vectorSimilarity: 0,
		lexicalSimilarity: 0,
	};

	async function entityFor(enriched: boolean): Promise<Entity> {
		const lines = parseCslSdn(await csl(), "2026-07-30");
		const finalLines = enriched
			? applyAliasEnrichment(lines, parseNonLatinAliases(await xml())).lines
			: lines;
		const line = finalLines.find((l) => l.entity_id === "OFAC_SDN:9760");
		if (line === undefined) {
			throw new Error("Lukashenko is missing from the CSL fixture");
		}
		return {
			entity_id: line.entity_id,
			entity_type: line.entity_type,
			primary_name: line.primary_name,
			name_canonical: canonicalize(line.primary_name),
			aliases: line.aliases.map((a) => ({
				name: a.name,
				name_canonical: canonicalize(a.name),
				source: line.source_list,
			})),
			dob: [...line.dob],
			countries: [...line.countries],
			risk_category: line.risk_category as RiskCategory,
			source_list: line.source_list,
			list_version: line.list_version,
		};
	}

	test("RED without enrichment: the Cyrillic query does not match", async () => {
		const result = computeScore(
			await entityFor(false),
			query,
			PRESETS.balanced.weights,
		);
		expect(result.reasons.some((r) => r.signal === "alias_match")).toBe(false);
	});

	test("GREEN with enrichment: exact alias match on the right entity", async () => {
		const entity = await entityFor(true);
		const result = computeScore(entity, query, PRESETS.balanced.weights);

		const alias = result.reasons.find((r) => r.signal === "alias_match");
		expect(alias).toBeDefined();
		// The reason names the ALIAS THAT MATCHED — it is the Cyrillic string.
		expect(alias?.value).toBe(LUKASHENKA_CYRILLIC);
		expect(alias?.description).toContain(LUKASHENKA_CYRILLIC);
		// An EXACT alias hit, at full weight — not a substring consolation.
		expect(alias?.contribution).toBe(PRESETS.balanced.weights.alias_match);
		// …and it is the right entity: Lukashenko, not some other record.
		expect(entity.entity_id).toBe("OFAC_SDN:9760");
		expect(entity.primary_name).toBe("LUKASHENKA, Alyaksandr Ryhorovich");
		expect(result.score).toBeGreaterThan(0);
	});
});

describe("fetchNonLatinAliases (network seam)", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	test("goes through the shared feed seam, identified, and parses the body", async () => {
		const body = await xml();
		const fetchMock = vi.fn(
			async (
				_input: string | URL | Request,
				_init?: RequestInit,
			): Promise<Response> => new Response(body, { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);

		const found = await fetchNonLatinAliases();

		expect(found.byEntityNumber.get("9760")).toContain(LUKASHENKA_CYRILLIC);
		expect(String(fetchMock.mock.calls[0]?.[0])).toBe(SDN_ALIAS_MIRROR_URL);
		// Inherits the identifying User-Agent from fetchWithTimeout.
		expect(
			new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("user-agent"),
		).toMatch(/aml-filter/i);
	});

	test("propagates an outage so the caller can degrade deliberately", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (): Promise<Response> => new Response("", { status: 404 })),
		);
		await expect(fetchNonLatinAliases()).rejects.toThrow(/404/);
	});
});

describe("degenerate input", () => {
	test("NO_ENRICHMENT contributes nothing", () => {
		expect(NO_ENRICHMENT.aliasesFound).toBe(0);
		expect(NO_ENRICHMENT.byEntityNumber.size).toBe(0);
	});

	test("a file with no parties yields nothing rather than throwing", () => {
		expect(parseNonLatinAliases("<Sanctions></Sanctions>").aliasesFound).toBe(
			0,
		);
		expect(parseNonLatinAliases("").aliasesFound).toBe(0);
	});

	test("decodes XML entity references inside a name", () => {
		const doc = [
			"<Sanctions><ReferenceValueSets><ScriptValues>",
			'<Script ID="220">Cyrillic</Script>',
			"</ScriptValues></ReferenceValueSets>",
			'<DistinctParty FixedRef="1"><DocumentedName>',
			'<DocumentedNamePart><NamePartValue ScriptID="220">Ро&amp;машка</NamePartValue></DocumentedNamePart>',
			"</DocumentedName></DistinctParty></Sanctions>",
		].join("");
		expect(parseNonLatinAliases(doc).byEntityNumber.get("1")).toEqual([
			"Ро&машка",
		]);
	});

	test("a name with an unknown ScriptID is kept, not silently dropped", () => {
		const doc = [
			"<Sanctions><ReferenceValueSets><ScriptValues>",
			'<Script ID="215">Latin</Script>',
			"</ScriptValues></ReferenceValueSets>",
			'<DistinctParty FixedRef="2"><DocumentedName>',
			'<DocumentedNamePart><NamePartValue ScriptID="999">ᚠᚢᚦ</NamePartValue></DocumentedNamePart>',
			"</DocumentedName></DistinctParty></Sanctions>",
		].join("");
		const found = parseNonLatinAliases(doc);
		expect(found.byEntityNumber.get("2")).toEqual(["ᚠᚢᚦ"]);
		expect(found.byScript.get("Unknown")).toBe(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY SAFETY. The real feed is ~125 MB. Buffering it and parsing one string
// risks a Node heap OOM — which is FATAL AND UNCATCHABLE, so the fail-soft
// try/catch around enrichment would never run and the deploy would die. That is
// exactly the hostage failure this PR series exists to remove, so the parser
// must hold memory flat regardless of feed size.
// ─────────────────────────────────────────────────────────────────────────────
async function* chunked(text: string, size: number): AsyncIterable<Uint8Array> {
	const bytes = new TextEncoder().encode(text);
	for (let i = 0; i < bytes.length; i += size) {
		yield bytes.subarray(i, Math.min(i + size, bytes.length));
	}
}

describe("parseNonLatinAliasesFromStream", () => {
	test("matches the whole-string parser exactly", async () => {
		const body = await xml();
		const streamed = await parseNonLatinAliasesFromStream(chunked(body, 4096));
		const whole = parseNonLatinAliases(body);

		expect(streamed.aliasesFound).toBe(whole.aliasesFound);
		expect([...streamed.byEntityNumber.entries()].sort()).toEqual(
			[...whole.byEntityNumber.entries()].sort(),
		);
	});

	test.each([1, 7, 64, 999])(
		"is correct when chunks split records AND multi-byte characters (size %i)",
		async (size) => {
			// A 1-byte chunk size guarantees every Cyrillic/Arabic codepoint is
			// split across chunk boundaries. Naive per-chunk decoding mangles them.
			const found = await parseNonLatinAliasesFromStream(
				chunked(await xml(), size),
			);
			expect(found.byEntityNumber.get("9760")).toContain(LUKASHENKA_CYRILLIC);
		},
	);

	// THE memory property: as the feed grows, the window does NOT. Comparing a
	// small feed against one 20x larger is what distinguishes "streams" from
	// "buffers" — a single measurement on a fixture cannot tell them apart.
	test("holds the window FLAT as the feed grows 20x", async () => {
		const body = await xml();
		const scripts = body.slice(0, body.indexOf("</ScriptValues>") + 15);
		const party = body.slice(
			body.indexOf("<DistinctParty "),
			body.indexOf("</DistinctParty>") + 16,
		);
		const feed = (copies: number) =>
			`${scripts}${party.repeat(copies)}</Sanctions>`;

		const small = await parseNonLatinAliasesFromStream(chunked(feed(10), 4096));
		const large = await parseNonLatinAliasesFromStream(
			chunked(feed(200), 4096),
		);

		expect(feed(200).length).toBeGreaterThan(feed(10).length * 15);
		// 20x the payload must not meaningfully move the high-water mark.
		expect(large.peakBufferChars).toBeLessThan(
			(small.peakBufferChars ?? 0) * 1.5,
		);
		// …and it stays on the order of ONE record, not the feed.
		expect(large.peakBufferChars).toBeLessThan(party.length * 3);
		expect(large.peakBufferChars).toBeLessThan(feed(200).length / 20);
	});

	test("discards the 26 MB of reference data ahead of the first record", async () => {
		const body = await xml();
		// Pad the pre-record region the way the real feed does; the window must
		// not hold on to it once the script map has been read.
		const at = body.indexOf("<DistinctParty ");
		const padded = `${body.slice(0, at)}${"<!-- x -->".repeat(50_000)}${body.slice(at)}`;
		const found = await parseNonLatinAliasesFromStream(chunked(padded, 4096));

		expect(found.byEntityNumber.get("9760")).toContain(LUKASHENKA_CYRILLIC);
		expect(found.peakBufferChars).toBeLessThan(padded.length / 4);
	});

	test("refuses a feed that exceeds the byte cap instead of consuming it", async () => {
		await expect(
			parseNonLatinAliasesFromStream(chunked(await xml(), 4096), {
				maxBytes: 1_000,
			}),
		).rejects.toThrow(AliasFeedTooLargeError);
	});

	test("refuses a single record larger than the window", async () => {
		await expect(
			parseNonLatinAliasesFromStream(chunked(await xml(), 4096), {
				maxWindowChars: 512,
			}),
		).rejects.toThrow(AliasFeedTooLargeError);
	});
});

// The bounds exist so failure is CATCHABLE. A heap OOM aborts the process and
// no `catch` runs — these paths must throw ordinary errors instead.
describe("real failure modes stay catchable", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	test("an oversized mirror response is refused mid-stream, not consumed", async () => {
		const huge = `<Sanctions><ScriptValues><Script ID="220">Cyrillic</Script></ScriptValues>${"<pad/>".repeat(200_000)}`;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (): Promise<Response> => new Response(huge, { status: 200 })),
		);

		await expect(fetchNonLatinAliases({ maxBytes: 4_096 })).rejects.toThrow(
			AliasFeedTooLargeError,
		);
	});

	test("a stalled mirror hits the deadline and rejects", async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async (_input: string | URL | Request, init?: RequestInit) =>
					new Promise<Response>((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () =>
							reject(new DOMException("aborted", "AbortError")),
						);
					}),
			),
		);

		const pending = fetchNonLatinAliases();
		const assertion = expect(pending).rejects.toThrow(/timed out/i);
		await vi.advanceTimersByTimeAsync(240_000);
		await assertion;
	});

	test("AliasFeedTooLargeError is an ordinary catchable Error", () => {
		// Documents the contrast that motivates the whole design.
		let caught: unknown = null;
		try {
			throw new AliasFeedTooLargeError("boom");
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(Error);
		expect(caught).toBeInstanceOf(AliasFeedTooLargeError);
	});
});
