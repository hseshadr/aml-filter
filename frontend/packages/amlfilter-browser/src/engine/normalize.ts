// TS port of aml_filter.domain.normalization.normalize_name — the canonical-name
// pipeline the producer ran on every entity. The browser must canonicalize the
// QUERY the same way so query<->entity name comparison is apples-to-apples:
//   NFKD -> strip non-word/space/hyphen -> lowercase -> drop titles -> collapse ws.

/** Titles dropped during canonicalization (mirrors the backend TITLES set). */
const TITLES: ReadonlySet<string> = new Set([
	"mr",
	"mrs",
	"miss",
	"ms",
	"dr",
	"prof",
	"professor",
	"sir",
	"dame",
	"lord",
	"lady",
	"hon",
	"honorable",
	"rev",
	"reverend",
	"fr",
	"father",
	"sr",
	"sister",
	"br",
	"brother",
]);

// Python's `re.sub(r"[^\w\s-]", "", s)` with the default (Unicode) flags keeps
// letters, digits, underscore, whitespace, and hyphen; everything else is
// dropped. \w in JS is ASCII-only by default, so we spell the keep-set with a
// Unicode property escape to match Python's \w on accented letters.
const DROP_PUNCT = /[^\p{L}\p{N}_\s-]/gu;
const COLLAPSE_WS = /\s+/g;

/** Canonicalize a raw name into the producer's canonical form. */
export function canonicalize(name: string): string {
	if (!name || name.trim().length === 0) {
		return "";
	}
	const stripped = name.normalize("NFKD").replace(DROP_PUNCT, "").toLowerCase();
	const kept = stripped
		.split(/\s+/)
		.filter((word) => word.length > 0 && !TITLES.has(word));
	return kept.join(" ").replace(COLLAPSE_WS, " ").trim();
}

// --- Date-of-birth canonicalization --------------------------------------
// The four sanctions sources emit DOBs in inconsistent shapes (ISO, "10 Dec
// 1948", UK day-first "12/04/1980", "circa 1955", ranges, the "-0-" sentinel).
// The engine's dob_match compares strings and slices(0,4) for the year — i.e.
// it ASSUMES an ISO prefix. normalizeDob canonicalizes a raw DOB into the most
// precise ISO prefix available (YYYY-MM-DD, YYYY-MM, or YYYY), else null.
// Parsing is explicit regex + an integer month map — no `new Date(...)`, which
// is locale/timezone-fragile and avoided across this codebase.

const MONTHS: ReadonlyMap<string, number> = new Map([
	["jan", 1],
	["january", 1],
	["feb", 2],
	["february", 2],
	["mar", 3],
	["march", 3],
	["apr", 4],
	["april", 4],
	["may", 5],
	["jun", 6],
	["june", 6],
	["jul", 7],
	["july", 7],
	["aug", 8],
	["august", 8],
	["sep", 9],
	["sept", 9],
	["september", 9],
	["oct", 10],
	["october", 10],
	["nov", 11],
	["november", 11],
	["dec", 12],
	["december", 12],
]);

const MIN_YEAR = 1850;
const MAX_YEAR = 2100;
// Qualifiers some sources prepend to an approximate year ("circa", "c.", …).
const DOB_QUALIFIER = /\b(circa|approx(?:imately)?|abt|about|c)\b\.?/gi;

const ISO_RE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
const YEAR_RANGE_RE = /^(\d{4})\s*(?:to|-|–|\/)\s*(\d{4})$/;
const NAMED_RE = /^(?:(\d{1,2})\s+)?([a-z]+)\.?\s+(\d{4})$/;
const DMY_RE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
const BARE_YEAR_RE = /^(\d{4})$/;

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

function isYear(y: number): boolean {
	return y >= MIN_YEAR && y <= MAX_YEAR;
}

/** Assemble an ISO prefix, validating each present field; null if any is bad. */
function isoPrefix(
	year: number,
	month: number | null,
	day: number | null,
): string | null {
	if (!isYear(year)) {
		return null;
	}
	if (month === null) {
		return String(year);
	}
	if (month < 1 || month > 12) {
		return null;
	}
	if (day === null) {
		return `${year}-${pad(month)}`;
	}
	if (day < 1 || day > 31) {
		return null;
	}
	return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Canonicalize a raw date-of-birth string into the most precise ISO prefix
 * available (YYYY-MM-DD, YYYY-MM, or YYYY), or null if unparseable/out of range.
 */
export function normalizeDob(raw: string): string | null {
	const trimmed = raw.trim();
	if (trimmed.length === 0 || trimmed === "-0-") {
		return null;
	}
	const cleaned = trimmed
		.replace(DOB_QUALIFIER, "")
		.replace(COLLAPSE_WS, " ")
		.trim();
	if (cleaned.length === 0) {
		return null;
	}

	const iso = ISO_RE.exec(cleaned);
	if (iso) {
		const month = iso[2] ? Number(iso[2]) : null;
		const day = iso[3] ? Number(iso[3]) : null;
		return isoPrefix(Number(iso[1]), month, day);
	}

	// A 4-digit/4-digit range (both sides years): take the first year. Checked
	// before DMY so "1960-1962" is not misread as a day-first date.
	const range = YEAR_RANGE_RE.exec(cleaned);
	if (range && isYear(Number(range[1]))) {
		return isoPrefix(Number(range[1]), null, null);
	}

	const named = NAMED_RE.exec(cleaned.toLowerCase());
	if (named) {
		const month = MONTHS.get(named[2] ?? "");
		if (month !== undefined) {
			const day = named[1] ? Number(named[1]) : null;
			return isoPrefix(Number(named[3]), month, day);
		}
	}

	// UK OFSI day-first dd/mm/yyyy (and dd-mm-yyyy) — never mm/dd.
	const dmy = DMY_RE.exec(cleaned);
	if (dmy) {
		return isoPrefix(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
	}

	const bare = BARE_YEAR_RE.exec(cleaned);
	if (bare) {
		return isoPrefix(Number(bare[1]), null, null);
	}

	return null;
}
