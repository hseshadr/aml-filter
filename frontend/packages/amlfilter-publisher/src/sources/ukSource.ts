// UK OFSI consolidated sanctions adapter (the "ConList" CSV).
//
// fetchRaw: REAL — pulls the maintained OFSI ConList blob (a single CSV).
// parse:    REAL — an RFC-4180 CSV reader skips the leading `Last Updated,<date>`
//   metadata line, reads the header from the first line that actually carries the
//   known columns, then groups data rows by "Group ID" (the primary-name row +
//   AKA rows of one entity share an id) into namespaced SourceLines.
//   Fixture-tested in ukSource.test.ts.

import { fetchWithTimeout } from "./fetchWithTimeout.ts";
import {
	namespacedId,
	type RawListBytes,
	type SourceLine,
	UK_LIST_ID,
	type WatchlistSource,
} from "./source.ts";

/** The logical raw-file key for the single UK CSV document. */
export const UK_RAW_FILE = "uk_ofsi.csv";

// The maintained OFSI ConList blob. The gov.uk ConList page was officially
// Withdrawn 2026-01-28 in favor of the UK Sanctions List (UKSL), but this blob is
// still being updated, so we ship it now; migrating the adapter to UKSL is a
// tracked future increment. (The bare `.../publishlive/ConList.csv` and the
// `assets.publishing.service.gov.uk/...` paths now 404 — do not use them.)
const UK_URL =
	"https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv";

/** The column that uniquely keys a real ConList header row. */
const HEADER_MARKER_COL = "Group ID";

const FORENAME_COLS = ["Name 1", "Name 2", "Name 3", "Name 4", "Name 5"];

/** Split one CSV line into fields per RFC 4180: double-quoted fields may contain
 * commas and embedded quotes are escaped by doubling (`""` -> `"`). */
function splitCsv(line: string): string[] {
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
			fields.push(field.trim());
			field = "";
		} else {
			field += ch;
		}
	}
	fields.push(field.trim());
	return fields;
}

/** A single source CSV row, keyed by header name. */
type Row = Record<string, string>;

/** Find the header line: the first line that carries the known marker column.
 * This robustly skips the leading `Last Updated,<date>` metadata line, which has
 * only two fields and lacks the `Group ID` column. */
function findHeaderIndex(lines: readonly string[]): number {
	return lines.findIndex((line) => splitCsv(line).includes(HEADER_MARKER_COL));
}

function parseRows(csv: string): Row[] {
	const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
	const headerIdx = findHeaderIndex(lines);
	if (headerIdx < 0) {
		return [];
	}
	const header = splitCsv(lines[headerIdx] ?? "");
	return lines.slice(headerIdx + 1).map((line) => {
		const fields = splitCsv(line);
		const row: Row = {};
		header.forEach((h, i) => {
			row[h] = fields[i] ?? "";
		});
		return row;
	});
}

function displayName(row: Row): string {
	const fore = FORENAME_COLS.map((c) => row[c] ?? "").filter((v) => v !== "");
	const last = row["Name 6"] ?? "";
	return [...fore, last]
		.filter((v) => v !== "")
		.join(" ")
		.trim();
}

function entityType(row: Row): "PERSON" | "ORGANIZATION" {
	return (row["Group Type"] ?? "").toLowerCase() === "individual"
		? "PERSON"
		: "ORGANIZATION";
}

/** Accumulate the rows of one Group ID into a SourceLine. */
function foldGroup(rows: Row[], listVersion: string): SourceLine {
	const primaryRow =
		rows.find((r) => (r["Alias Type"] ?? "") === "Primary name") ?? rows[0];
	const groupId = primaryRow?.["Group ID"] ?? "";
	const aliases = rows
		.filter((r) => (r["Alias Type"] ?? "") !== "Primary name")
		.map((r) => ({ name: displayName(r) }))
		.filter((a) => a.name !== "");
	const dob = primaryRow?.DOB ?? "";
	const nat = primaryRow?.Nationality ?? "";
	return {
		entity_id: namespacedId(UK_LIST_ID, groupId),
		primary_name: displayName(primaryRow ?? {}),
		entity_type: entityType(primaryRow ?? {}),
		aliases,
		dob: dob !== "" ? [dob] : [],
		countries: nat !== "" ? [nat] : [],
		risk_category: "SANCTION",
		source_list: UK_LIST_ID,
		list_version: listVersion,
	};
}

/** Group rows by "Group ID", preserving first-seen order. */
function groupRows(rows: Row[]): Map<string, Row[]> {
	const groups = new Map<string, Row[]>();
	for (const row of rows) {
		const id = row["Group ID"] ?? "";
		const list = groups.get(id) ?? [];
		list.push(row);
		groups.set(id, list);
	}
	return groups;
}

export const ukSource: WatchlistSource = {
	id: UK_LIST_ID,
	title: "UK OFSI",
	async fetchRaw(): Promise<RawListBytes> {
		const res = await fetchWithTimeout(UK_URL, "UK");
		if (!res.ok) {
			throw new Error(`fetch UK list failed: ${res.status} ${res.statusText}`);
		}
		return { [UK_RAW_FILE]: await res.text() };
	},
	sourceUpdatedAt(raw: RawListBytes): string | undefined {
		const firstLine = (raw[UK_RAW_FILE] ?? "").split(/\r?\n/, 1)[0];
		const value = firstLine?.match(/^Last Updated,(\d{2})\/(\d{2})\/(\d{4})$/);
		if (value === null || value === undefined) {
			return undefined;
		}
		const [, day, month, year] = value;
		return `${year}-${month}-${day}T00:00:00.000Z`;
	},
	parse(raw: RawListBytes, listVersion: string): SourceLine[] {
		const rows = parseRows(raw[UK_RAW_FILE] ?? "");
		return [...groupRows(rows).values()].map((g) => foldGroup(g, listVersion));
	},
};
