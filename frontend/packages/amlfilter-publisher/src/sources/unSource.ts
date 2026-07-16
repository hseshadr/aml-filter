// UN consolidated sanctions adapter.
//
// fetchRaw: REAL — the UN consolidated list is a single public XML at a stable
//   URL (no token), fetched directly.
// parse:    REAL — maps INDIVIDUAL and ENTITY nodes (DATAID, FIRST..FOURTH_NAME,
//   *_ALIAS/ALIAS_NAME, INDIVIDUAL_DATE_OF_BIRTH/DATE, NATIONALITY/VALUE) into
//   namespaced SourceLines. Fixture-tested in unSource.test.ts.

import {
	namespacedId,
	type RawListBytes,
	type SourceLine,
	UN_LIST_ID,
	type WatchlistSource,
} from "./source.ts";
import { elements, textOf } from "./xml.ts";

/** The logical raw-file key for the single UN XML document. */
export const UN_RAW_FILE = "un_consolidated.xml";

const UN_URL = "https://scsanctions.un.org/resources/xml/en/consolidated.xml";

const NAME_TAGS = ["FIRST_NAME", "SECOND_NAME", "THIRD_NAME", "FOURTH_NAME"];

function joinedName(inner: string): string {
	return NAME_TAGS.map((t) => textOf(inner, t))
		.filter((p): p is string => p !== undefined)
		.join(" ")
		.trim();
}

function aliasesOf(inner: string, tag: string): { name: string }[] {
	return elements(inner, tag)
		.map((a) => textOf(a.inner, "ALIAS_NAME"))
		.filter((n): n is string => n !== undefined)
		.map((name) => ({ name }));
}

function dobOf(inner: string): string[] {
	const date = textOf(inner, "DATE") ?? textOf(inner, "YEAR");
	return date !== undefined ? [date] : [];
}

function nationalitiesOf(inner: string): string[] {
	const out = new Set<string>();
	for (const nat of elements(inner, "NATIONALITY")) {
		const v = textOf(nat.inner, "VALUE");
		if (v !== undefined) {
			out.add(v);
		}
	}
	return [...out].sort();
}

function toLine(
	inner: string,
	type: "PERSON" | "ORGANIZATION",
	aliasTag: string,
	listVersion: string,
): SourceLine {
	return {
		entity_id: namespacedId(UN_LIST_ID, textOf(inner, "DATAID") ?? ""),
		primary_name: joinedName(inner),
		entity_type: type,
		aliases: aliasesOf(inner, aliasTag),
		dob: type === "PERSON" ? dobOf(inner) : [],
		countries: nationalitiesOf(inner),
		risk_category: "SANCTION",
		source_list: UN_LIST_ID,
		list_version: listVersion,
	};
}

export const unSource: WatchlistSource = {
	id: UN_LIST_ID,
	title: "UN Consolidated",
	async fetchRaw(): Promise<RawListBytes> {
		const res = await fetch(UN_URL);
		if (!res.ok) {
			throw new Error(`fetch UN list failed: ${res.status} ${res.statusText}`);
		}
		return { [UN_RAW_FILE]: await res.text() };
	},
	sourceUpdatedAt(raw: RawListBytes): string | undefined {
		return elements(raw[UN_RAW_FILE] ?? "", "CONSOLIDATED_LIST")[0]?.attrs
			.dateGenerated;
	},
	parse(raw: RawListBytes, listVersion: string): SourceLine[] {
		const xml = raw[UN_RAW_FILE] ?? "";
		const persons = elements(xml, "INDIVIDUAL").map((el) =>
			toLine(el.inner, "PERSON", "INDIVIDUAL_ALIAS", listVersion),
		);
		const orgs = elements(xml, "ENTITY").map((el) =>
			toLine(el.inner, "ORGANIZATION", "ENTITY_ALIAS", listVersion),
		);
		return [...persons, ...orgs];
	},
};
