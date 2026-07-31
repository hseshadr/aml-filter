// Reader for the US Government's Consolidated Screening List (CSL), published
// by the Commerce Department's International Trade Administration at
// data.trade.gov, filtered down to the OFAC SDN entries.
//
// WHY NOT TREASURY'S OWN SDN.CSV. We used to read OFAC's SDN.CSV + ALT.CSV
// directly. On 2026-07-30 Treasury put that service behind an AWS WAF: a request
// with no browser User-Agent is answered 403, and one with a browser User-Agent
// is answered 202 + `x-amzn-waf-action: challenge` (an empty body plus a
// JavaScript challenge no plain HTTP client can solve). There is no
// authoritative-origin endpoint a build can read any more.
//
// CSL is the US Government's own consolidated publication of the same
// designations — same ultimate publisher, no WAF, no bot challenge, and NO
// THIRD PARTY in the provenance chain. That last point is why it was chosen over
// mirrors of Treasury's XML, which are byte-faithful but add an intermediary to
// a sanctions-data supply chain.
//
// WHAT IS AND IS NOT INCLUDED. CSL aggregates twelve US screening lists. We keep
// EXACTLY the rows whose `source` is the OFAC SDN list (CSL_SDN_SOURCE) so the
// published population stays what `OFAC_SDN` has always meant. The other OFAC
// Treasury lists carried by CSL (SSI, CMIC, NS-MBS, PLC, CAPTA) are deliberately
// NOT folded in: adding them would silently broaden a list consumers already
// screen against under a fixed name.
//
// FIELD NOTE — COUNTRIES. CSL publishes `citizenships`/`nationalities` as ISO-2
// alpha codes ("TN; BA"). That is exactly the value space the product wants: the
// engine's countryMatch() does exact uppercase set membership and the UI asks
// the user for an "ISO2" "Country Code". (The old SDN.CSV path scraped full
// country names out of freeform `Remarks`, which could never match a user typing
// the ISO2 code the UI requested.) The set is de-duplicated because the country
// sub-score is 1.0 / setSize — duplicate members would silently divide it down.
//
// FIELD NOTE — DATES. CSL publishes a dedicated `dates_of_birth` column, mostly
// already ISO (`1969-02-08`), instead of the freeform `DOB ...` prose the old
// path had to regex out of `Remarks`. Values are passed through verbatim;
// normalization to an ISO prefix stays downstream in sourceEntity.ts.

import { namespacedId, OFAC_LIST_ID, type SourceLine } from "./source.ts";

/** The exact `source` value identifying OFAC SDN rows inside the CSL file. */
export const CSL_SDN_SOURCE =
	"Specially Designated Nationals (SDN) - Treasury Department";

/** Columns this reader depends on; a missing one fails the build loudly. */
const REQUIRED_COLUMNS = [
	"source",
	"entity_number",
	"type",
	"name",
	"alt_names",
	"dates_of_birth",
	"citizenships",
	"nationalities",
] as const;

/** Split one CSV line into fields per RFC 4180.
 *
 * A double-quoted field may contain commas — CSL primary names are
 * `"LASTNAME, Firstname"` — and embedded quotes escaped by doubling (`""`).
 * A naive split on "," shifts every later column and corrupts the record, so a
 * quote-aware scanner is required. CSL rows carry no embedded newlines (
 * verified against the live 16 MB file), so a per-line scanner is sufficient. */
export function splitCsvLine(line: string): string[] {
	const fields: string[] = [];
	let field = "";
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (inQuotes) {
			if (ch === '"') {
				if (line[i + 1] === '"') {
					field += '"';
					i++; // consume the escaped quote
				} else {
					inQuotes = false;
				}
			} else {
				field += ch;
			}
		} else if (ch === '"') {
			inQuotes = true;
		} else if (ch === ",") {
			fields.push(field);
			field = "";
		} else {
			field += ch;
		}
	}
	fields.push(field);
	return fields.map((f) => f.trim());
}

/** Map header name -> column index, failing on any column we depend on. */
function columnIndex(headerLine: string): ReadonlyMap<string, number> {
	const header = splitCsvLine(headerLine);
	const index = new Map(header.map((name, i) => [name, i]));
	const missing = REQUIRED_COLUMNS.filter((c) => !index.has(c));
	if (missing.length > 0) {
		throw new Error(
			`CSL file is missing required column(s): ${missing.join(", ")} — the upstream schema changed`,
		);
	}
	return index;
}

/** Split a `a; b; c` cell into trimmed, non-empty, de-duplicated values. */
function multi(cell: string): string[] {
	const out: string[] = [];
	for (const part of cell.split(";")) {
		const value = part.trim();
		if (value !== "" && !out.includes(value)) {
			out.push(value);
		}
	}
	return out;
}

/** CSL types are Individual / Entity / Vessel / Aircraft. */
function entityType(type: string): "PERSON" | "ORGANIZATION" {
	return type.toLowerCase() === "individual" ? "PERSON" : "ORGANIZATION";
}

/** Read one field by column name, defaulting to "". */
function cell(
	fields: readonly string[],
	index: ReadonlyMap<string, number>,
	name: string,
): string {
	const at = index.get(name);
	return at === undefined ? "" : (fields[at] ?? "");
}

/** Build one SourceLine from an SDN row. */
function toSourceLine(
	fields: readonly string[],
	index: ReadonlyMap<string, number>,
	listVersion: string,
): SourceLine {
	const read = (name: string): string => cell(fields, index, name);
	return {
		entity_id: namespacedId(OFAC_LIST_ID, read("entity_number")),
		primary_name: read("name"),
		entity_type: entityType(read("type")),
		aliases: multi(read("alt_names")).map((name) => ({ name })),
		dob: multi(read("dates_of_birth")),
		// Citizenship and nationality are the same signal for screening; union
		// them, de-duplicated (the country sub-score divides by the set size).
		countries: multi(`${read("citizenships")};${read("nationalities")}`),
		risk_category: "SANCTION",
		source_list: OFAC_LIST_ID,
		list_version: listVersion,
	};
}

/** Parse the CSL consolidated CSV, keeping only the OFAC SDN designations. */
export function parseCslSdn(csv: string, listVersion: string): SourceLine[] {
	const lines = csv.split(/\r?\n/);
	const headerLine = lines[0];
	if (headerLine === undefined || headerLine.trim() === "") {
		throw new Error("CSL file is empty — no header row");
	}
	const index = columnIndex(headerLine);
	const out: SourceLine[] = [];
	for (const raw of lines.slice(1)) {
		if (raw.trim() === "") {
			continue;
		}
		const fields = splitCsvLine(raw);
		if (cell(fields, index, "source") !== CSL_SDN_SOURCE) {
			continue;
		}
		if (
			cell(fields, index, "entity_number") === "" ||
			cell(fields, index, "name") === ""
		) {
			continue;
		}
		out.push(toSourceLine(fields, index, listVersion));
	}
	return out;
}
