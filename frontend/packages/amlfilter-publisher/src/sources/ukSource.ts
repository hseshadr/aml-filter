// UK OFSI consolidated sanctions adapter (the "ConList" CSV).
//
// fetchRaw: SCAFFOLDED — OFSI publishes the consolidated list as a CSV (and an
//   XML) at a stable gov.uk path, but the exact asset URL is occasionally
//   re-pathed; the real CSV endpoint is wired with a TODO to confirm the asset id.
// parse:    REAL — a header-aware CSV reader groups rows by "Group ID" (the
//   primary-name row + AKA rows of one entity share an id) into namespaced
//   SourceLines. Fixture-tested in ukSource.test.ts.

import {
	namespacedId,
	type RawListBytes,
	type SourceLine,
	UK_LIST_ID,
	type WatchlistSource,
} from "./source.ts";

/** The logical raw-file key for the single UK CSV document. */
export const UK_RAW_FILE = "uk_ofsi.csv";

/** TODO(asset): confirm the current consolidated-list CSV asset path. */
const UK_URL =
	"https://assets.publishing.service.gov.uk/media/uk-sanctions-list/ConList.csv";

const FORENAME_COLS = ["Name 1", "Name 2", "Name 3", "Name 4", "Name 5"];

/** Split one CSV line into fields, honoring simple double-quoted fields. */
function splitCsv(line: string): string[] {
	const fields: string[] = [];
	const re = /(?:^|,)(?:"([^"]*)"|([^,]*))/g;
	for (let m = re.exec(line); m !== null; m = re.exec(line)) {
		fields.push((m[1] ?? m[2] ?? "").trim());
	}
	return fields;
}

/** A single source CSV row, keyed by header name. */
type Row = Record<string, string>;

function parseRows(csv: string): Row[] {
	const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
	const header = splitCsv(lines[0] ?? "");
	return lines.slice(1).map((line) => {
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
		// TODO(asset): confirm/lock the current consolidated CSV asset path.
		const res = await fetch(UK_URL);
		if (!res.ok) {
			throw new Error(`fetch UK list failed: ${res.status} ${res.statusText}`);
		}
		return { [UK_RAW_FILE]: await res.text() };
	},
	parse(raw: RawListBytes, listVersion: string): SourceLine[] {
		const rows = parseRows(raw[UK_RAW_FILE] ?? "");
		return [...groupRows(rows).values()].map((g) => foldGroup(g, listVersion));
	},
};
