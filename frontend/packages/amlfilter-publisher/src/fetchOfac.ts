// Fetch + parse the live OFAC SDN list into the publisher's source-JSONL shape.
//
// OFAC publishes fixed-position CSVs at https://www.treasury.gov/ofac/downloads/:
//   SDN.CSV  ent_num, SDN_Name, SDN_Type, Program, Title, Call_Sign, Vess_type,
//            Tonnage, GRT, Vess_flag, Vess_owner, Remarks
//   ALT.CSV  ent_num, alt_num, alt_type, alt_name, alt_remarks
// Rows are quoted, comma-separated, with "-0-" used as the empty sentinel.
//
// This maps id / name / type / aliases FOR REAL (joining ALT.CSV by ent_num).
// DOB and country are NOT extracted: OFAC carries them only in the freeform
// `Remarks` text ("DOB 12 Mar 1955; nationality Cuba; ..."), whose grammar is
// inconsistent across decades of entries. Parsing it reliably is a substantial
// task on its own and is deliberately left as a marked TODO — the DEMO path
// (demo_entities.jsonl) is fully real and is what the tests + committed artifact
// exercise. See the README.
//
// `SourceLine` is the shared neutral shape (see sources/source.ts); entity_id is
// the NAMESPACED id `OFAC_SDN:<ent_num>` so it stays unique across lists.

import {
	namespacedId,
	OFAC_LIST_ID,
	type SourceLine,
} from "./sources/source.ts";

export const OFAC_BASE = "https://www.treasury.gov/ofac/downloads";
const EMPTY = "-0-";

/** Split one OFAC CSV line into fields, stripping the surrounding quotes and
 * mapping the "-0-" sentinel to an empty string. (OFAC does not embed commas
 * inside quoted name fields, so a simple split on `","` is sufficient.) */
function splitCsvLine(line: string): string[] {
	const trimmed = line.replace(/^"/, "").replace(/"$/, "");
	return trimmed.split('","').map((f) => (f === EMPTY ? "" : f.trim()));
}

function entityType(sdnType: string): "PERSON" | "ORGANIZATION" {
	return sdnType.toLowerCase() === "individual" ? "PERSON" : "ORGANIZATION";
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
		lines.push({
			entity_id: namespacedId(OFAC_LIST_ID, entNum),
			primary_name: name,
			entity_type: entityType(fields[2] ?? ""),
			aliases: (aliasesByEnt.get(entNum) ?? []).map((n) => ({ name: n })),
			dob: [],
			countries: [],
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
