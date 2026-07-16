import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SignatureError, verifyEd25519 } from "@amlfilter/browser/engine";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Catalog } from "./catalog.ts";
import { createFakeEmbedder } from "./fakeEmbedder.ts";
import { publishCatalog } from "./publishCatalog.ts";
import { derivePublicKey } from "./signing.ts";
import type {
	RawListBytes,
	SourceLine,
	WatchlistSource,
} from "./sources/source.ts";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES = resolve(HERE, "../fixtures");
const FIXED_AT = "2026-06-19T00:00:00Z";

async function demoKey(): Promise<Uint8Array> {
	return new Uint8Array(await readFile(resolve(FIXTURES, "demo.key")));
}

/** A source whose fetchRaw resolves with committed fixture text, then parses it
 * into one source line. The slug is the catalog path; id is the namespace. */
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
					aliases: [],
					dob: [],
					countries: [],
					risk_category: "SANCTIONS",
					source_list: id,
					list_version: listVersion,
				},
			];
		},
	};
}

/** A source whose fetchRaw throws — stands in for EU/UK (scaffolded fetchRaw). */
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

describe("publishCatalog", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "aml-pubcat-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	async function readCatalog(): Promise<Catalog> {
		return JSON.parse(
			await readFile(join(dir, "catalog.json"), "utf8"),
		) as Catalog;
	}

	async function verifyPair(subdir: string, name: string): Promise<void> {
		const pub = await derivePublicKey(await demoKey());
		const root = subdir === "" ? dir : join(dir, subdir);
		const bytes = new Uint8Array(await readFile(join(root, name)));
		const sig = await readFile(join(root, `${name}.sig`), "utf8");
		await expect(verifyEd25519(pub, bytes, sig)).resolves.toBeUndefined();
		const tampered = Uint8Array.from(bytes);
		tampered[0] = (tampered[0] ?? 0) ^ 0xff;
		await expect(verifyEd25519(pub, tampered, sig)).rejects.toThrow(
			SignatureError,
		);
	}

	test("fails closed when any configured source cannot be fetched", async () => {
		const sources: readonly { source: WatchlistSource; slug: string }[] = [
			{
				source: fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich"),
				slug: "ofac",
			},
			{ source: fakeSource("UN_CONSOLIDATED", "UN", "Jane Roe"), slug: "un" },
			{ source: throwingSource("EU_CONSOLIDATED", "EU"), slug: "eu" },
		];
		await expect(
			publishCatalog({
				sources,
				version: "test-1",
				privateKey: await demoKey(),
				outDir: dir,
				embedder: createFakeEmbedder(),
				generatedAt: FIXED_AT,
			}),
		).rejects.toThrow(/EU_CONSOLIDATED.*required feed/i);
		await expect(readCatalog()).rejects.toThrow();
	});

	test("signs the catalog and every per-list artifact verifiably against the demo key", async () => {
		const sources: readonly { source: WatchlistSource; slug: string }[] = [
			{
				source: fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich"),
				slug: "ofac",
			},
			{ source: fakeSource("UN_CONSOLIDATED", "UN", "Jane Roe"), slug: "un" },
			{ source: fakeSource("UK_OFSI", "UK", "Example UK"), slug: "uk" },
		];
		await publishCatalog({
			sources,
			version: "test-1",
			privateKey: await demoKey(),
			outDir: dir,
			embedder: createFakeEmbedder(),
			generatedAt: FIXED_AT,
		});

		await verifyPair("", "catalog.json");
		for (const slug of ["ofac", "un", "uk"]) {
			await verifyPair(slug, "watchlist.json");
			await verifyPair(slug, "watchlist.manifest.json");
		}
	});

	test("fails closed when the first source's fetchRaw throws", async () => {
		const sources: readonly { source: WatchlistSource; slug: string }[] = [
			{ source: throwingSource("EU_CONSOLIDATED", "EU"), slug: "eu" },
			{ source: throwingSource("UK_OFSI", "UK"), slug: "uk" },
		];
		await expect(
			publishCatalog({
				sources,
				version: "test-1",
				privateKey: await demoKey(),
				outDir: dir,
				embedder: createFakeEmbedder(),
				generatedAt: FIXED_AT,
			}),
		).rejects.toThrow(/EU_CONSOLIDATED.*required feed/i);
	});
});
