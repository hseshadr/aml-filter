// Non-Latin alias enrichment for the OFAC SDN list.
//
// THE GAP THIS CLOSES. Records come from Commerce's Consolidated Screening List
// (see csl.ts) because Treasury's own export is behind a bot-challenge WAF. CSL
// is complete on records — 19,181, cross-validated entity-for-entity — but it
// publishes names in Latin script only. Treasury's SDN_ADVANCED.XML additionally
// carries each designation's name in its ORIGINAL script, and the engine's
// canonicalize() preserves those scripts (it lowercases and folds diacritics, it
// does not transliterate). So without this module a Cyrillic, Arabic or CJK
// query can never match, no matter how exactly it is spelled.
//
// WHAT IT IS AND IS NOT. This is an ENRICHMENT, not a second record source. CSL
// remains the sole authority on WHICH entities are designated and on every
// field. This module contributes exactly one thing: additional alias STRINGS,
// attached to records that already exist, joined on the entity id that already
// cross-validates 19,181/19,181. It can never add, remove or alter a record.
//
// PROVENANCE. The bytes are Treasury's own published SDN_ADVANCED.XML. They are
// fetched through the OpenSanctions mirror because the origin is WAF-blocked —
// the mirror is TRANSPORT, not the author. That is still a weaker chain than the
// government-published CSL, which is exactly why it is confined to aliases and
// why the two sources are named separately everywhere the data is described.
//
// SCRIPT DETECTION. Every <NamePartValue> carries a ScriptID, and the file ships
// its own <ScriptValues> reference set mapping those ids to names. We read that
// set rather than hardcoding an id or guessing from codepoints, so a new script
// is classified correctly the day OFAC starts using it.
//
// FAIL SOFT, NEVER SILENT. A mirror outage yields an EMPTY enrichment, the
// bundle publishes CSL-only, and the caller reports which mode produced it.

import { fetchWithTimeout } from "./fetchWithTimeout.ts";
import type { SourceLine } from "./source.ts";

/** The script name this enrichment deliberately skips (CSL already has it). */
export const LATIN_SCRIPT = "Latin";

/** Treasury's SDN_ADVANCED.XML, mirrored. Overridable (no host lock-in). */
export const SDN_ALIAS_MIRROR_URL =
	process.env.SDN_ALIAS_MIRROR_URL ??
	"https://data.opensanctions.org/datasets/latest/us_ofac_sdn/source.xml";

/** ~125 MB, so it gets a longer deadline than the record feed. */
const MIRROR_TIMEOUT_MS = 240_000;

/** Non-Latin alias names, keyed by OFAC entity number (the XML's FixedRef). */
export interface AliasEnrichment {
	readonly byEntityNumber: ReadonlyMap<string, readonly string[]>;
	readonly aliasesFound: number;
	readonly byScript: ReadonlyMap<string, number>;
}

/** An enrichment that contributes nothing — the fail-soft value. */
export const NO_ENRICHMENT: AliasEnrichment = {
	byEntityNumber: new Map(),
	aliasesFound: 0,
	byScript: new Map(),
};

const SCRIPT_RE = /<Script\b[^>]*\bID="(\d+)"[^>]*>([^<]*)<\/Script>/g;
const PARTY_RE = /<DistinctParty FixedRef="(\d+)">([\s\S]*?)<\/DistinctParty>/g;
const DOC_NAME_RE = /<DocumentedName\b[^>]*>([\s\S]*?)<\/DocumentedName>/g;
const NAME_PART_RE = /<NamePartValue\b([^>]*)>([^<]*)<\/NamePartValue>/g;
const SCRIPT_ID_RE = /ScriptID="(\d+)"/;

/** XML entity references that appear in OFAC name values. */
function decodeXml(text: string): string {
	return text
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
		.replace(/&amp;/g, "&");
}

/** ScriptID -> script name, read from the file's own reference set. */
function scriptNames(xml: string): ReadonlyMap<string, string> {
	const names = new Map<string, string>();
	SCRIPT_RE.lastIndex = 0;
	let match = SCRIPT_RE.exec(xml);
	while (match !== null) {
		if (match[1] !== undefined && match[2] !== undefined) {
			names.set(match[1], match[2].trim());
		}
		match = SCRIPT_RE.exec(xml);
	}
	return names;
}

/** One rendered name: its parts joined in document order, plus its script. */
interface RenderedName {
	readonly text: string;
	readonly script: string;
}

/** Every <DocumentedName> inside one party, as rendered text + script. */
function renderedNames(
	body: string,
	scripts: ReadonlyMap<string, string>,
): readonly RenderedName[] {
	const out: RenderedName[] = [];
	DOC_NAME_RE.lastIndex = 0;
	let doc = DOC_NAME_RE.exec(body);
	while (doc !== null) {
		const parts: string[] = [];
		let scriptId: string | undefined;
		NAME_PART_RE.lastIndex = 0;
		let part = NAME_PART_RE.exec(doc[1] ?? "");
		while (part !== null) {
			const id = SCRIPT_ID_RE.exec(part[1] ?? "");
			if (id?.[1] !== undefined) {
				scriptId = id[1];
			}
			const value = decodeXml(part[2] ?? "").trim();
			if (value !== "") {
				parts.push(value);
			}
			part = NAME_PART_RE.exec(doc[1] ?? "");
		}
		if (parts.length > 0) {
			out.push({
				text: parts.join(" "),
				script: (scriptId && scripts.get(scriptId)) || "Unknown",
			});
		}
		doc = DOC_NAME_RE.exec(body);
	}
	return out;
}

/** Extract every non-Latin name OFAC publishes, keyed by entity number. */
export function parseNonLatinAliases(xml: string): AliasEnrichment {
	const scripts = scriptNames(xml);
	const byEntityNumber = new Map<string, string[]>();
	const byScript = new Map<string, number>();
	let aliasesFound = 0;

	PARTY_RE.lastIndex = 0;
	let party = PARTY_RE.exec(xml);
	while (party !== null) {
		const ref = party[1] ?? "";
		const seen = new Set(byEntityNumber.get(ref) ?? []);
		for (const name of renderedNames(party[2] ?? "", scripts)) {
			if (name.script === LATIN_SCRIPT || seen.has(name.text)) {
				continue;
			}
			seen.add(name.text);
			const list = byEntityNumber.get(ref) ?? [];
			list.push(name.text);
			byEntityNumber.set(ref, list);
			byScript.set(name.script, (byScript.get(name.script) ?? 0) + 1);
			aliasesFound += 1;
		}
		party = PARTY_RE.exec(xml);
	}
	return { byEntityNumber, aliasesFound, byScript };
}

/** What one enrichment pass contributed. */
export interface EnrichmentResult {
	readonly lines: readonly SourceLine[];
	readonly aliasesAdded: number;
	readonly entitiesEnriched: number;
}

/** The `OFAC_SDN:` prefix stripped back to the bare entity number. */
function entityNumber(entityId: string): string {
	const colon = entityId.indexOf(":");
	return colon === -1 ? entityId : entityId.slice(colon + 1);
}

/** Append non-Latin aliases to the records that already exist.
 *
 * Never adds, removes or reorders records, and never replaces an alias — a name
 * the record already carries (case-insensitively) is skipped, so re-running is
 * idempotent and a mirror hiccup can never inflate the list. */
export function applyAliasEnrichment(
	lines: readonly SourceLine[],
	enrichment: AliasEnrichment,
): EnrichmentResult {
	let aliasesAdded = 0;
	let entitiesEnriched = 0;
	const enriched = lines.map((line) => {
		const extra = enrichment.byEntityNumber.get(entityNumber(line.entity_id));
		if (extra === undefined || extra.length === 0) {
			return line;
		}
		const have = new Set(
			[line.primary_name, ...line.aliases.map((a) => a.name)].map((n) =>
				n.toLowerCase(),
			),
		);
		const fresh = extra.filter((name) => {
			const key = name.toLowerCase();
			if (have.has(key)) {
				return false;
			}
			have.add(key);
			return true;
		});
		if (fresh.length === 0) {
			return line;
		}
		aliasesAdded += fresh.length;
		entitiesEnriched += 1;
		return {
			...line,
			aliases: [...line.aliases, ...fresh.map((name) => ({ name }))],
		};
	});
	return { lines: enriched, aliasesAdded, entitiesEnriched };
}

/** Fetch Treasury's SDN_ADVANCED.XML through the mirror.
 *
 * Throws on any failure; the caller decides whether that degrades the bundle to
 * CSL-only or fails the build (the deploy degrades, the nightly fails). */
export async function fetchNonLatinAliases(): Promise<AliasEnrichment> {
	const response = await fetchWithTimeout(
		SDN_ALIAS_MIRROR_URL,
		"OFAC SDN aliases (Treasury SDN_ADVANCED.XML via mirror)",
		MIRROR_TIMEOUT_MS,
	);
	return parseNonLatinAliases(await response.text());
}
