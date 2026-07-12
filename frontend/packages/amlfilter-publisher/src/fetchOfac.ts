// Fetch + parse the live OFAC SDN list into the publisher's source-JSONL shape.
//
// OFAC publishes fixed-position CSVs from its sanctions-list service at
// https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/
// (the current machine-readable portal behind https://sanctionslist.ofac.treas.gov;
// each export 302-redirects to a short-lived presigned S3 URL, which fetch follows):
//   SDN.CSV  ent_num, SDN_Name, SDN_Type, Program, Title, Call_Sign, Vess_type,
//            Tonnage, GRT, Vess_flag, Vess_owner, Remarks
//   ALT.CSV  ent_num, alt_num, alt_type, alt_name, alt_remarks
// Rows are quoted, comma-separated, with "-0-" used as the empty sentinel.
// The base URL is overridable via the OFAC_BASE env var (proactive config; no
// hardcoded host lock-in) — unset falls back to the service default above.
//
// This maps id / name / type / aliases FOR REAL (joining ALT.CSV by ent_num).
// DOB and country are extracted from the freeform, semicolon-delimited `Remarks`
// text ("DOB 12 Mar 1955; nationality Cuba; Citizen Iran; ...") by `parseRemarks`
// below: every `DOB ` segment and every `nationality `/`Citizen ` segment is
// collected (de-duplicated, order-preserved). The DOB is kept as the raw OFAC
// substring (e.g. "14 Mar 1971") — cross-source DOB-format normalization (EU
// emits ISO, UK emits dd/mm/yyyy) is a separate concern handled downstream.
//
// `SourceLine` is the shared neutral shape (see sources/source.ts); entity_id is
// the NAMESPACED id `OFAC_SDN:<ent_num>` so it stays unique across lists.

import {
	namespacedId,
	OFAC_LIST_ID,
	type SourceLine,
} from "./sources/source.ts";

export const OFAC_BASE =
	process.env.OFAC_BASE ??
	"https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports";
const EMPTY = "-0-";

/** Split one OFAC CSV line into fields per RFC 4180, then map the "-0-" sentinel
 * to an empty string. A double-quoted field may contain commas (OFAC primary
 * names are `"LASTNAME, Firstname"`) and embedded quotes escaped by doubling
 * (`""` -> `"`). A naive split on `","` shifts every column right on such rows
 * (name becomes the `SDN_Type` value) and shatters `Remarks`, dropping DOB and
 * country — so a quote-aware char scanner is required. OFAC SDN.CSV records are
 * single-line (fields use the `-0-` sentinel, never an embedded newline), so a
 * per-line scanner is sufficient. */
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
	return fields.map((f) => {
		const trimmed = f.trim();
		return trimmed === EMPTY ? "" : trimmed;
	});
}

function entityType(sdnType: string): "PERSON" | "ORGANIZATION" {
	return sdnType.toLowerCase() === "individual" ? "PERSON" : "ORGANIZATION";
}

/** Append `value` to `out` unless it's blank or already present (order-preserved
 * de-dup). */
function pushUnique(out: string[], value: string): void {
	const trimmed = value.trim();
	if (trimmed !== "" && !out.includes(trimmed)) {
		out.push(trimmed);
	}
}

/** Parse OFAC's freeform `Remarks` field (semicolon-delimited segments) into the
 * DOB and country signals. Recognized: `DOB <value>` (alternates allowed, e.g.
 * "DOB 14 Mar 1971", "DOB circa 1955", "DOB 1960") and `nationality <value>` /
 * `Citizen <value>`. Unrecognized segments (Gender, Passport, ...) are ignored,
 * and the "-0-"/empty sentinel yields no data. The DOB is kept as the raw OFAC
 * substring — cross-source ISO/dd-mm-yyyy normalization is a separate concern. */
export function parseRemarks(remarks: string): {
	dob: string[];
	countries: string[];
} {
	const dob: string[] = [];
	const countries: string[] = [];
	for (const segment of remarks.split(";")) {
		const trimmed = segment.trim();
		const dobMatch = /^DOB\s+(.+)$/i.exec(trimmed);
		if (dobMatch?.[1] !== undefined) {
			pushUnique(dob, dobMatch[1]);
			continue;
		}
		const countryMatch = /^(?:nationality|Citizen)\s+(.+)$/i.exec(trimmed);
		if (countryMatch?.[1] !== undefined) {
			pushUnique(countries, countryMatch[1]);
		}
	}
	return { dob, countries };
}

/** Group ALT.CSV alias names by ent_num. */
function indexAliases(altCsv: string): Map<string, string[]> {
	const byEnt = new Map<string, string[]>();
	for (const line of altCsv.split(/\r?\n/)) {
		if (line.trim() === "") {
			continue;
		}
		const fields = splitCsvLine(line);
		const entNum = fields[0];
		const altName = fields[3];
		if (entNum === undefined || altName === undefined || altName === "") {
			continue;
		}
		const list = byEnt.get(entNum) ?? [];
		list.push(altName);
		byEnt.set(entNum, list);
	}
	return byEnt;
}

/** Map SDN.CSV + ALT.CSV into source lines, joining aliases by ent_num. */
export function parseSdn(
	sdnCsv: string,
	altCsv: string,
	listVersion: string,
): SourceLine[] {
	const aliasesByEnt = indexAliases(altCsv);
	const lines: SourceLine[] = [];
	for (const raw of sdnCsv.split(/\r?\n/)) {
		if (raw.trim() === "") {
			continue;
		}
		const fields = splitCsvLine(raw);
		const entNum = fields[0];
		const name = fields[1];
		if (entNum === undefined || name === undefined || name === "") {
			continue;
		}
		const { dob, countries } = parseRemarks(fields[11] ?? "");
		lines.push({
			entity_id: namespacedId(OFAC_LIST_ID, entNum),
			primary_name: name,
			entity_type: entityType(fields[2] ?? ""),
			aliases: (aliasesByEnt.get(entNum) ?? []).map((n) => ({ name: n })),
			dob,
			countries,
			risk_category: "SANCTION",
			source_list: OFAC_LIST_ID,
			list_version: listVersion,
		});
	}
	return lines;
}

async function fetchText(url: string): Promise<string> {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
	}
	return res.text();
}

/** Fetch the live SDN.CSV + ALT.CSV and return source lines as a JSONL string.
 * `listVersion` stamps each record (use the run date, e.g. an ISO date). */
export async function fetchOfacJsonl(listVersion: string): Promise<string> {
	const [sdn, alt] = await Promise.all([
		fetchText(`${OFAC_BASE}/SDN.CSV`),
		fetchText(`${OFAC_BASE}/ALT.CSV`),
	]);
	return parseSdn(sdn, alt, listVersion)
		.map((line) => JSON.stringify(line))
		.join("\n");
}
