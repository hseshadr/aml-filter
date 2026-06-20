// OFAC SDN adapter — wraps the existing parseSdn/SDN.CSV+ALT.CSV reader.
//
// fetchRaw: REAL — pulls the live SDN.CSV + ALT.CSV off treasury.gov.
// parse:    REAL — delegates to parseSdn (fixture-tested in ofacSource.test.ts
//           and fetchOfac.test.ts). entity_id is namespaced "OFAC_SDN:<ent_num>".

import { OFAC_BASE, parseSdn } from "../fetchOfac.ts";
import {
	OFAC_LIST_ID,
	type RawListBytes,
	type SourceLine,
	type WatchlistSource,
} from "./source.ts";

const SDN_FILE = "SDN.CSV";
const ALT_FILE = "ALT.CSV";

async function fetchText(url: string): Promise<string> {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
	}
	return res.text();
}

export const ofacSource: WatchlistSource = {
	id: OFAC_LIST_ID,
	title: "OFAC SDN",
	async fetchRaw(): Promise<RawListBytes> {
		const [sdn, alt] = await Promise.all([
			fetchText(`${OFAC_BASE}/${SDN_FILE}`),
			fetchText(`${OFAC_BASE}/${ALT_FILE}`),
		]);
		return { [SDN_FILE]: sdn, [ALT_FILE]: alt };
	},
	parse(raw: RawListBytes, listVersion: string): SourceLine[] {
		return parseSdn(raw[SDN_FILE] ?? "", raw[ALT_FILE] ?? "", listVersion);
	},
};
