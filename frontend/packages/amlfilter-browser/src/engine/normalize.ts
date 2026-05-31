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
