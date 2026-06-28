// buildRealBundle's pure glue: fetch each configured source via its adapter,
// parse + map to wire entities, embed the canonical names, and shape one
// StagedList per list whose fetchRaw succeeded — skipping (logging) a source
// whose fetchRaw throws (mirrors publishCatalog's fail-soft policy). The test
// injects FAKE sources (no network) and the FAKE embedder (no 23 MB model), so
// it exercises only the staging glue, never edge-proc and never a live fetch.

import { describe, expect, test } from "vitest";
import {
	type RealBundleSourceSpec,
	stagedListsFromSources,
} from "./buildRealBundle.ts";
import { createFakeEmbedder } from "./fakeEmbedder.ts";
import type {
	RawListBytes,
	SourceLine,
	WatchlistSource,
} from "./sources/source.ts";

const VERSION = "2026-06-23";

/** A source whose fetchRaw resolves and parses to one PERSON line. */
function fakeSource(id: string, title: string, name: string): WatchlistSource {
	return {
		id,
		title,
		async fetchRaw(): Promise<RawListBytes> {
			return { "list.txt": name };
		},
		parse(raw: RawListBytes, listVersion: string): SourceLine[] {
			const primary = raw["list.txt"] ?? "";
			return [
				{
					entity_id: `${id}:1`,
					primary_name: primary,
					entity_type: "PERSON",
					aliases: [{ name: `${primary} (aka)` }],
					dob: ["1980-01-02"],
					countries: ["US", "CA"],
					risk_category: "SANCTIONS",
					source_list: id,
					list_version: listVersion,
				},
			];
		},
	};
}

/** A source whose fetchRaw throws — stands in for an upstream feed that is down
 * (or a scaffolded adapter); publishCatalog logs-and-skips these. */
function throwingSource(id: string, title: string): WatchlistSource {
	return {
		id,
		title,
		async fetchRaw(): Promise<RawListBytes> {
			throw new Error(`fetchRaw not wired for ${id}`);
		},
		parse(): SourceLine[] {
			return [];
		},
	};
}

const DIM = 384; // matches EMBEDDING_DIM the fake embedder produces.

describe("stagedListsFromSources", () => {
	test("stages one list per source whose fetchRaw succeeds, in order", async () => {
		const specs: readonly RealBundleSourceSpec[] = [
			{
				source: fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich"),
				slug: "ofac",
			},
			{
				source: fakeSource("UN_CONSOLIDATED", "UN Consolidated", "Jane Roe"),
				slug: "un",
			},
		];
		const staged = await stagedListsFromSources(
			specs,
			createFakeEmbedder(),
			VERSION,
		);
		expect(staged.map((l) => l.listId)).toEqual([
			"OFAC_SDN",
			"UN_CONSOLIDATED",
		]);
		expect(staged.map((l) => l.slug)).toEqual(["ofac", "un"]);
		expect(staged.map((l) => l.title)).toEqual(["OFAC SDN", "UN Consolidated"]);
	});

	test("maps source lines to wire entities and embeds canonical names", async () => {
		const specs: readonly RealBundleSourceSpec[] = [
			{
				source: fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich"),
				slug: "ofac",
			},
		];
		const [list] = await stagedListsFromSources(
			specs,
			createFakeEmbedder(),
			VERSION,
		);
		if (list === undefined) {
			throw new Error("expected one staged list");
		}
		expect(list.version).toBe(VERSION);
		expect(list.dim).toBe(DIM);
		expect(list.entities).toHaveLength(1);
		const entity = list.entities[0];
		if (entity === undefined) {
			throw new Error("expected one entity");
		}
		// toWatchlistEntity recomputes name_canonical via the shared canonicalize,
		// sorts countries, flattens alias names, and takes dob[0].
		expect(entity.entity_id).toBe("OFAC_SDN:1");
		expect(entity.name_canonical).toBe("ivan fakovich");
		expect(entity.aliases).toEqual(["Ivan Fakovich (aka)"]);
		expect(entity.dob).toBe("1980-01-02");
		expect(entity.countries).toEqual(["CA", "US"]);
		expect(entity.source_list).toBe("OFAC_SDN");
		expect(entity.list_version).toBe(VERSION);
		// One row of dim floats per entity.
		expect(list.vectors).toHaveLength(DIM);
	});

	test("logs-and-skips a source whose fetchRaw throws (fail-soft)", async () => {
		const logged: string[] = [];
		const specs: readonly RealBundleSourceSpec[] = [
			{
				source: fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich"),
				slug: "ofac",
			},
			{
				source: throwingSource("EU_CONSOLIDATED", "EU Consolidated"),
				slug: "eu",
			},
		];
		const staged = await stagedListsFromSources(
			specs,
			createFakeEmbedder(),
			VERSION,
			(m) => logged.push(m),
		);
		expect(staged.map((l) => l.listId)).toEqual(["OFAC_SDN"]);
		expect(logged.join("\n")).toMatch(/EU_CONSOLIDATED/);
	});

	test("throws when no source fetched (never stage an empty bundle)", async () => {
		const specs: readonly RealBundleSourceSpec[] = [
			{ source: throwingSource("OFAC_SDN", "OFAC SDN"), slug: "ofac" },
		];
		await expect(
			stagedListsFromSources(specs, createFakeEmbedder(), VERSION, () => {}),
		).rejects.toThrow(/no source fetched/i);
	});
});
