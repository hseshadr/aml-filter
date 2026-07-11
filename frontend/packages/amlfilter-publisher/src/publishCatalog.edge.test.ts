// publishCatalog edge behavior: a source that rejects with a NON-Error value is
// still skipped with a stringified reason (the fail-soft policy never assumes
// upstream code throws Error), and an omitted generatedAt stamps a fresh ISO
// instant into the signed catalog. Also pins buildCatalog's comparator for
// equal ids (stable order). Fake sources + fake embedder + throwaway key.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildCatalog } from "./catalog.ts";
import { createFakeEmbedder } from "./fakeEmbedder.ts";
import { publishCatalog } from "./publishCatalog.ts";
import type {
	RawListBytes,
	SourceLine,
	WatchlistSource,
} from "./sources/source.ts";

const TEST_KEY = new Uint8Array(32).fill(5);

const goodSource: WatchlistSource = {
	id: "GOOD_LIST",
	title: "Good List",
	async fetchRaw(): Promise<RawListBytes> {
		return { "list.txt": "Jane Q. Entity" };
	},
	parse(raw: RawListBytes, listVersion: string): SourceLine[] {
		return [
			{
				entity_id: "GOOD_LIST:1",
				primary_name: raw["list.txt"] ?? "",
				entity_type: "PERSON",
				aliases: [],
				dob: [],
				countries: [],
				risk_category: "SANCTION",
				source_list: "GOOD_LIST",
				list_version: listVersion,
			},
		];
	},
};

/** Rejects with a plain string — NOT an Error — to hit the String(err) path. */
const rudeSource: WatchlistSource = {
	id: "RUDE_LIST",
	title: "Rude List",
	fetchRaw(): Promise<RawListBytes> {
		return Promise.reject("boom-string");
	},
	parse(): SourceLine[] {
		return [];
	},
};

describe("publishCatalog edge cases", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "aml-cat-edge-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	test("skips a non-Error rejection with a stringified reason and stamps a fresh generatedAt", async () => {
		const skips: string[] = [];
		const before = Date.now();
		const ids = await publishCatalog({
			sources: [
				{ source: goodSource, slug: "good" },
				{ source: rudeSource, slug: "rude" },
			],
			version: "v1",
			privateKey: TEST_KEY,
			outDir: dir,
			embedder: createFakeEmbedder(),
			log: (m) => skips.push(m),
		});
		expect(ids).toEqual(["GOOD_LIST"]);
		expect(skips).toEqual([
			"skipping RUDE_LIST: fetchRaw failed (boom-string)",
		]);
		const catalog = JSON.parse(
			await readFile(join(dir, "catalog.json"), "utf8"),
		) as { generatedAt: string; lists: readonly { id: string }[] };
		expect(catalog.lists.map((l) => l.id)).toEqual(["GOOD_LIST"]);
		const at = Date.parse(catalog.generatedAt);
		expect(at).toBeGreaterThanOrEqual(before - 1000);
		expect(at).toBeLessThanOrEqual(Date.now() + 1000);
	});
});

describe("buildCatalog ordering", () => {
	test("equal ids keep their input order (stable sort, comparator 0 branch)", () => {
		const first = {
			id: "SAME",
			title: "A",
			version: "1",
			entitiesCount: 1,
			path: "a/",
		};
		const second = {
			id: "SAME",
			title: "B",
			version: "1",
			entitiesCount: 2,
			path: "b/",
		};
		const catalog = buildCatalog([first, second], "2026-07-11T00:00:00Z");
		expect(catalog.lists.map((l) => l.path)).toEqual(["a/", "b/"]);
	});
});
