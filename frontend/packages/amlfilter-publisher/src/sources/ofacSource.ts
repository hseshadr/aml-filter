// OFAC SDN adapter — wraps the existing parseSdn/SDN.CSV+ALT.CSV reader.
//
// fetchRaw: REAL — pulls the live SDN.CSV + ALT.CSV off the OFAC sanctions-list
//           service (OFAC_BASE, overridable via env; see fetchOfac.ts).
// parse:    REAL — delegates to parseSdn (fixture-tested in ofacSource.test.ts
//           and fetchOfac.test.ts). entity_id is namespaced "OFAC_SDN:<ent_num>".

import { OFAC_BASE, parseSdn } from "../fetchOfac.ts";
import { fetchWithTimeout } from "./fetchWithTimeout.ts";
import {
	OFAC_LIST_ID,
	type RawListBytes,
	SOURCE_UPDATED_AT_KEY,
	type SourceLine,
	type WatchlistSource,
} from "./source.ts";

const SDN_FILE = "SDN.CSV";
const ALT_FILE = "ALT.CSV";

interface FetchedText {
	readonly text: string;
	readonly updatedAt: string;
}

async function fetchText(url: string): Promise<FetchedText> {
	const res = await fetchWithTimeout(url, "OFAC");
	if (!res.ok) {
		throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
	}
	const updatedAt = res.headers.get("last-modified");
	if (updatedAt === null) {
		throw new Error(`fetch ${url} omitted Last-Modified`);
	}
	return { text: await res.text(), updatedAt };
}

function oldestUpdate(values: readonly string[]): string {
	const timestamps = values.map((value) => Date.parse(value));
	if (timestamps.some((value) => !Number.isFinite(value))) {
		return "invalid";
	}
	return new Date(Math.min(...timestamps)).toISOString();
}

export const ofacSource: WatchlistSource = {
	id: OFAC_LIST_ID,
	title: "OFAC SDN",
	async fetchRaw(): Promise<RawListBytes> {
		const [sdn, alt] = await Promise.all([
			fetchText(`${OFAC_BASE}/${SDN_FILE}`),
			fetchText(`${OFAC_BASE}/${ALT_FILE}`),
		]);
		return {
			[SDN_FILE]: sdn.text,
			[ALT_FILE]: alt.text,
			[SOURCE_UPDATED_AT_KEY]: oldestUpdate([sdn.updatedAt, alt.updatedAt]),
		};
	},
	sourceUpdatedAt(raw: RawListBytes): string | undefined {
		return raw[SOURCE_UPDATED_AT_KEY];
	},
	parse(raw: RawListBytes, listVersion: string): SourceLine[] {
		return parseSdn(raw[SDN_FILE] ?? "", raw[ALT_FILE] ?? "", listVersion);
	},
};
