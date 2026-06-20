// EU consolidated sanctions adapter.
//
// fetchRaw: SCAFFOLDED — the EU FSD feed is served behind a rotating access
//   token (xmlFullSanctionsList_1_1?token=...). The real endpoint is wired with a
//   TODO to inject the token; parse() below is the real, fixture-tested part.
// parse:    REAL — maps <sanctionEntity> (logicalId, subjectType, nameAlias,
//   birthdate, citizenship/address country) into namespaced SourceLines.

import {
	EU_LIST_ID,
	namespacedId,
	type RawListBytes,
	type SourceLine,
	type WatchlistSource,
} from "./source.ts";
import { elements } from "./xml.ts";

/** The logical raw-file key for the single EU XML document. */
export const EU_RAW_FILE = "eu_consolidated.xml";

/** TODO(token): the real feed requires a rotating access token query param. */
const EU_URL =
	"https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=";

function entityType(code: string): "PERSON" | "ORGANIZATION" {
	return code.toLowerCase() === "person" ? "PERSON" : "ORGANIZATION";
}

/** Collect sorted, de-duplicated ISO2 country codes from citizenship+address. */
function countriesOf(inner: string): string[] {
	const codes = new Set<string>();
	for (const tag of ["citizenship", "address"]) {
		for (const el of elements(inner, tag)) {
			const code = el.attrs.countryIso2Code;
			if (code !== undefined && code !== "") {
				codes.add(code);
			}
		}
	}
	return [...codes].sort();
}

function dobOf(inner: string): string[] {
	const el = elements(inner, "birthdate")[0];
	const date = el?.attrs.birthdate ?? el?.attrs.year;
	return date !== undefined && date !== "" ? [date] : [];
}

/** wholeName of each alias, primary = first; fall back to first/last join. */
function namesOf(inner: string): { primary: string; aliases: string[] } {
	const names = elements(inner, "nameAlias")
		.map((a) => {
			const whole = a.attrs.wholeName?.trim();
			if (whole !== undefined && whole !== "") {
				return whole;
			}
			return [a.attrs.firstName, a.attrs.lastName]
				.filter((p): p is string => p !== undefined && p !== "")
				.join(" ")
				.trim();
		})
		.filter((n) => n !== "");
	const [primary, ...aliases] = names;
	return { primary: primary ?? "", aliases };
}

function toLine(inner: string, attrs: Record<string, string>): SourceLine {
	const { primary, aliases } = namesOf(inner);
	const code = elements(inner, "subjectType")[0]?.attrs.code ?? "";
	return {
		entity_id: namespacedId(EU_LIST_ID, attrs.logicalId ?? ""),
		primary_name: primary,
		entity_type: entityType(code),
		aliases: aliases.map((name) => ({ name })),
		dob: dobOf(inner),
		countries: countriesOf(inner),
		risk_category: "SANCTION",
		source_list: EU_LIST_ID,
		list_version: "",
	};
}

export const euSource: WatchlistSource = {
	id: EU_LIST_ID,
	title: "EU Consolidated",
	async fetchRaw(): Promise<RawListBytes> {
		// TODO(token): append the rotating access token before fetching.
		const res = await fetch(EU_URL);
		if (!res.ok) {
			throw new Error(`fetch EU list failed: ${res.status} ${res.statusText}`);
		}
		return { [EU_RAW_FILE]: await res.text() };
	},
	parse(raw: RawListBytes, listVersion: string): SourceLine[] {
		const xml = raw[EU_RAW_FILE] ?? "";
		return elements(xml, "sanctionEntity").map((el) => ({
			...toLine(el.inner, el.attrs),
			list_version: listVersion,
		}));
	},
};
