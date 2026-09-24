// UK sanctions adapter: the FCDO UK Sanctions List (UKSL) CSV, filtered to
// asset-freeze designations.
//
// OFSI closed its Consolidated List ("ConList") on 2026-06-03; the UK Sanctions
// List is now the single source of UK designations. It also carries designations
// that impose no asset freeze (e.g. port bans on ships, director
// disqualification only), so this adapter keeps only designations whose
// `Sanctions Imposed` includes "Asset freeze" — the same meaning the UK list has
// always had here: "UK asset-freeze targets".
//
// fetchRaw: REAL — pulls the published UKSL CSV.
// parse:    REAL — an RFC-4180 line reader skips the leading `Report Date: <date>`
//   metadata line, reads the header from the first line carrying `Unique ID`,
//   then groups rows by `Unique ID` (one designation = one primary-name row plus
//   variation / alias rows, repeated once per DOB). Two traps shape it:
//   - `Name type` casing is inconsistent (`Primary name` / `Primary Name`), and
//     `Primary Name Variation` must not count as the primary: compare trimmed,
//     lowercased, and EXACTLY equal to "primary name".
//   - `OFSI Group ID` can span distinct designations; never group on it.
//   Fixture-tested in ukSource.test.ts (rows cut from the real feed).

import {
	fetchWithTimeout,
	readResponseText,
	SOURCE_FETCH_TIMEOUT_MS,
} from "./fetchWithTimeout.ts";
import {
	canonicalSourceTimestamp,
	namespacedId,
	type RawListBytes,
	type SourceLine,
	type SourceSnapshot,
	sourceSnapshot,
	UK_LIST_ID,
	type WatchlistSource,
} from "./source.ts";

/** The logical raw-file key for the single UK CSV document. Only the per-run
 * snapshot writes it to disk; nothing persisted is keyed on it. */
export const UK_RAW_FILE = "uk_sanctions_list.csv";

// The FCDO-published UK Sanctions List CSV. (The OFSI ConList blob at
// ofsistorage.blob.core.windows.net is frozen at 2026-06-03 — do not use it.)
export const UK_URL =
	"https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.csv";

// The CSV is ~50MB (2026-09); 128MB leaves headroom without being unbounded.
const UK_BODY_LIMITS = {
	maxBytes: 128 * 1024 * 1024,
	elapsedMs: SOURCE_FETCH_TIMEOUT_MS,
	idleMs: 15_000,
} as const;

/** The column that uniquely keys a real UKSL header row. */
const HEADER_MARKER_COL = "Unique ID";

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
 * This skips the leading `Report Date: <date>` metadata line. */
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

/** EXACT match after trim + lowercase: `Primary name` and `Primary Name` are
 * primary; `Primary Name Variation` is not (so never `startsWith`). */
function isPrimaryRow(row: Row): boolean {
	return (row["Name type"] ?? "").trim().toLowerCase() === "primary name";
}

function hasAssetFreeze(row: Row): boolean {
	return (row["Sanctions Imposed"] ?? "")
		.toLowerCase()
		.includes("asset freeze");
}

const ENTITY_TYPES: Readonly<Record<string, "PERSON" | "ORGANIZATION">> = {
	individual: "PERSON",
	entity: "ORGANIZATION",
	ship: "ORGANIZATION",
};

function entityType(row: Row): "PERSON" | "ORGANIZATION" {
	const kind = (row["Designation Type"] ?? "").trim().toLowerCase();
	return ENTITY_TYPES[kind] ?? "ORGANIZATION";
}

/** The first primary row that actually carries a name (the feed has primary
 * rows whose name lives only in the non-Latin column), else the first row. */
function primaryRowOf(rows: readonly Row[]): Row {
	return (
		rows.find((r) => isPrimaryRow(r) && displayName(r) !== "") ?? rows[0] ?? {}
	);
}

/** Distinct non-empty values of one column, in first-seen order. */
function distinctValues(rows: readonly Row[], col: string): string[] {
	const values = rows.map((r) => (r[col] ?? "").trim()).filter((v) => v !== "");
	return [...new Set(values)];
}

/** Accumulate the rows of one Unique ID into a SourceLine. The feed repeats a
 * designation's rows once per DOB, so names, DOBs and nationalities are
 * de-duplicated across all of its rows. */
function foldGroup(rows: Row[], listVersion: string): SourceLine {
	const primaryRow = primaryRowOf(rows);
	const primaryName = displayName(primaryRow);
	const aliasNames = new Set(rows.map(displayName));
	aliasNames.delete(primaryName);
	aliasNames.delete("");
	return {
		entity_id: namespacedId(UK_LIST_ID, primaryRow["Unique ID"] ?? ""),
		primary_name: primaryName,
		entity_type: entityType(primaryRow),
		aliases: [...aliasNames].map((name) => ({ name })),
		dob: distinctValues(rows, "D.O.B"),
		countries: distinctValues(rows, "Nationality(/ies)"),
		risk_category: "SANCTION",
		source_list: UK_LIST_ID,
		list_version: listVersion,
	};
}

/** Group rows by "Unique ID", preserving first-seen order. */
function groupRows(rows: Row[]): Map<string, Row[]> {
	const groups = new Map<string, Row[]>();
	for (const row of rows) {
		const id = row["Unique ID"] ?? "";
		const list = groups.get(id) ?? [];
		list.push(row);
		groups.set(id, list);
	}
	return groups;
}

/** A designation is kept when its primary row imposes an asset freeze. On the
 * 2026-09-21 feed `Sanctions Imposed` is uniform across every row of a Unique
 * ID (0 of 6,339 designations differ), so the primary row speaks for it. */
function isAssetFreezeDesignation(rows: readonly Row[]): boolean {
	return hasAssetFreeze(primaryRowOf(rows));
}

const MONTHS: Readonly<Record<string, number>> = {
	jan: 0,
	feb: 1,
	mar: 2,
	apr: 3,
	may: 4,
	jun: 5,
	jul: 6,
	aug: 7,
	sep: 8,
	oct: 9,
	nov: 10,
	dec: 11,
};

function invalidTimestamp(): Error {
	return new Error(`${UK_LIST_ID}: freshness timestamp is invalid`);
}

function updatedAt(raw: RawListBytes): string | undefined {
	const firstLine = (raw[UK_RAW_FILE] ?? "").split(/\r?\n/, 1)[0];
	const value = firstLine
		?.trim()
		.match(/^Report Date: (\d{2})-([A-Za-z]{3})-(\d{4})$/);
	if (value === null || value === undefined) {
		return undefined;
	}
	const [, day, monthName, year] = value;
	const month = MONTHS[(monthName ?? "").toLowerCase()];
	if (month === undefined) {
		throw invalidTimestamp();
	}
	const parsed = new Date(Date.UTC(Number(year), month, Number(day)));
	if (
		parsed.getUTCFullYear() !== Number(year) ||
		parsed.getUTCMonth() !== month ||
		parsed.getUTCDate() !== Number(day)
	) {
		throw invalidTimestamp();
	}
	return parsed.toISOString();
}

async function fetchUkSnapshot(): Promise<SourceSnapshot> {
	const { raw, response } = await fetchUkRaw();
	const sourceUpdatedAt = updatedAt(raw);
	if (sourceUpdatedAt === undefined) {
		throw new Error("UK_OFSI: freshness timestamp is missing");
	}
	return sourceSnapshot(
		raw,
		response,
		UK_URL,
		canonicalSourceTimestamp(UK_LIST_ID, sourceUpdatedAt),
	);
}

async function fetchUkRaw(): Promise<{
	readonly raw: RawListBytes;
	readonly response: Response;
}> {
	const response = await fetchWithTimeout(UK_URL, "UK");
	return {
		raw: {
			[UK_RAW_FILE]: await readResponseText(response, "UK", UK_BODY_LIMITS),
		},
		response,
	};
}

export const ukSource: WatchlistSource = {
	id: UK_LIST_ID,
	title: "UK Sanctions List",
	async fetchRaw(): Promise<RawListBytes> {
		return (await fetchUkRaw()).raw;
	},
	fetchSnapshot: fetchUkSnapshot,
	sourceUpdatedAt(raw: RawListBytes): string | undefined {
		return updatedAt(raw);
	},
	parse(raw: RawListBytes, listVersion: string): SourceLine[] {
		const rows = parseRows(raw[UK_RAW_FILE] ?? "");
		return [...groupRows(rows).values()]
			.filter(isAssetFreezeDesignation)
			.map((g) => foldGroup(g, listVersion));
	},
};
