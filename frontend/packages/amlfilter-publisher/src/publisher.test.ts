import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	canonicalize,
	EMBEDDING_DIM,
	EMBEDDING_MODEL,
} from "@amlfilter/browser";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createFakeEmbedder } from "./fakeEmbedder.ts";
import { publishWatchlist } from "./publisher.ts";
import type { Watchlist, WatchlistManifest } from "./types.ts";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const TINY = resolve(HERE, "../fixtures/tiny_entities.jsonl");
const FIXED_AT = "2026-06-19T00:00:00Z";
// A throwaway 32-byte key (NOT the demo key — format tests don't need cross-compat).
const TEST_KEY = new Uint8Array(32).fill(7);

async function publishToTemp(outDir: string): Promise<void> {
	await publishWatchlist({
		entitiesJsonlPath: TINY,
		version: "test-1",
		privateKey: TEST_KEY,
		outDir,
		embedder: createFakeEmbedder(),
		generatedAt: FIXED_AT,
	});
}

async function readWatchlist(dir: string): Promise<Watchlist> {
	return JSON.parse(
		await readFile(join(dir, "watchlist.json"), "utf8"),
	) as Watchlist;
}

async function readManifest(dir: string): Promise<WatchlistManifest> {
	return JSON.parse(
		await readFile(join(dir, "watchlist.manifest.json"), "utf8"),
	) as WatchlistManifest;
}

describe("publishWatchlist format", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "aml-pub-"));
		await publishToTemp(dir);
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	test("watchlist.json carries every contract field", async () => {
		const wl = await readWatchlist(dir);
		expect(wl.listId).toBe("OFAC_SDN");
		expect(wl.version).toBe("test-1");
		expect(wl.generatedAt).toBe(FIXED_AT);
		expect(wl.model).toBe(EMBEDDING_MODEL);
		expect(wl.dim).toBe(EMBEDDING_DIM);
		expect(wl.entities).toHaveLength(3);
		expect(typeof wl.vectors).toBe("string");
	});

	test("vectors base64 decodes to entities*dim Float32 values", async () => {
		const wl = await readWatchlist(dir);
		const bytes = Buffer.from(wl.vectors, "base64");
		const floats = new Float32Array(
			bytes.buffer,
			bytes.byteOffset,
			bytes.byteLength / 4,
		);
		expect(floats.length).toBe(wl.entities.length * EMBEDDING_DIM);
	});

	test("entities map per the contract (canonical, sorted countries, dob[0], aliases)", async () => {
		const wl = await readWatchlist(dir);
		const [first, , third] = wl.entities;
		expect(first?.name_canonical).toBe(canonicalize("Jon Q. Fakename"));
		expect(first?.countries).toEqual(["CA", "US"]); // sorted from ["US","CA"]
		expect(first?.dob).toBe("1970-01-01"); // first of the array
		expect(first?.aliases).toEqual(["Johnny Fake", "J. Q. Fake"]);
		expect(Array.isArray(first?.aliases)).toBe(true);
		expect(third?.dob).toBe("1988");
	});

	test("missing dob/aliases yield null and []; missing countries yields []", async () => {
		const wl = await readWatchlist(dir);
		// Entity 2 (Imaginary Holdings) has empty dob + aliases, one country.
		const org = wl.entities[1];
		expect(org?.dob).toBeNull();
		expect(org?.aliases).toEqual([]);
		expect(org?.countries).toEqual(["GB"]);
		// Entity 3 (Nadia Notreal) has an empty countries array.
		const noCountries = wl.entities[2];
		expect(noCountries?.countries).toEqual([]);
	});

	test("manifest mirrors the list head + carries entitiesCount", async () => {
		const wl = await readWatchlist(dir);
		const manifest = await readManifest(dir);
		expect(manifest.entitiesCount).toBe(wl.entities.length);
		expect(manifest.listId).toBe(wl.listId);
		expect(manifest.version).toBe(wl.version);
		expect(manifest.model).toBe(wl.model);
		expect(manifest.dim).toBe(wl.dim);
		expect(manifest.generatedAt).toBe(wl.generatedAt);
	});
});

describe("publishWatchlist determinism", () => {
	test("identical input + version + generatedAt + embedder ⇒ identical bytes", async () => {
		const a = await mkdtemp(join(tmpdir(), "aml-pub-a-"));
		const b = await mkdtemp(join(tmpdir(), "aml-pub-b-"));
		try {
			await publishToTemp(a);
			await publishToTemp(b);
			const wlA = await readFile(join(a, "watchlist.json"));
			const wlB = await readFile(join(b, "watchlist.json"));
			expect(wlA.equals(wlB)).toBe(true);
			const mA = await readFile(join(a, "watchlist.manifest.json"));
			const mB = await readFile(join(b, "watchlist.manifest.json"));
			expect(mA.equals(mB)).toBe(true);
		} finally {
			await rm(a, { recursive: true, force: true });
			await rm(b, { recursive: true, force: true });
		}
	});
});
