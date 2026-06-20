import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SignatureError, verifyEd25519 } from "@amlfilter/browser/engine";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	buildCatalog,
	type CatalogList,
	writeSignedCatalog,
} from "./catalog.ts";
import { derivePublicKey } from "./signing.ts";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES = resolve(HERE, "../fixtures");
const FIXED_AT = "2026-06-19T00:00:00Z";

const LISTS: readonly CatalogList[] = [
	{
		id: "UN_CONSOLIDATED",
		title: "UN",
		version: "u1",
		entitiesCount: 2,
		path: "un/",
	},
	{
		id: "OFAC_SDN",
		title: "OFAC",
		version: "o1",
		entitiesCount: 6,
		path: "ofac/",
	},
	{
		id: "EU_CONSOLIDATED",
		title: "EU",
		version: "e1",
		entitiesCount: 3,
		path: "eu/",
	},
];

async function demoKey(): Promise<Uint8Array> {
	return new Uint8Array(await readFile(resolve(FIXTURES, "demo.key")));
}

describe("buildCatalog", () => {
	test("schema 1, sorted by id for determinism", () => {
		const cat = buildCatalog(LISTS, FIXED_AT);
		expect(cat.schema).toBe(1);
		expect(cat.generatedAt).toBe(FIXED_AT);
		expect(cat.lists.map((l) => l.id)).toEqual([
			"EU_CONSOLIDATED",
			"OFAC_SDN",
			"UN_CONSOLIDATED",
		]);
	});

	test("each entry carries its list's version + count + path", () => {
		const cat = buildCatalog(LISTS, FIXED_AT);
		const ofac = cat.lists.find((l) => l.id === "OFAC_SDN");
		expect(ofac).toEqual({
			id: "OFAC_SDN",
			title: "OFAC",
			version: "o1",
			entitiesCount: 6,
			path: "ofac/",
		});
	});

	test("deterministic: same input ⇒ identical object", () => {
		expect(buildCatalog(LISTS, FIXED_AT)).toEqual(
			buildCatalog(LISTS, FIXED_AT),
		);
	});
});

describe("writeSignedCatalog", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "aml-cat-"));
		await writeSignedCatalog(
			dir,
			buildCatalog(LISTS, FIXED_AT),
			await demoKey(),
		);
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	test("writes catalog.json + detached catalog.json.sig that verifies", async () => {
		const pub = await derivePublicKey(await demoKey());
		const bytes = new Uint8Array(await readFile(join(dir, "catalog.json")));
		const sig = await readFile(join(dir, "catalog.json.sig"), "utf8");
		await expect(verifyEd25519(pub, bytes, sig)).resolves.toBeUndefined();
	});

	test("a flipped byte fails closed", async () => {
		const pub = await derivePublicKey(await demoKey());
		const bytes = new Uint8Array(await readFile(join(dir, "catalog.json")));
		const sig = await readFile(join(dir, "catalog.json.sig"), "utf8");
		const tampered = Uint8Array.from(bytes);
		tampered[0] = (tampered[0] ?? 0) ^ 0xff;
		await expect(verifyEd25519(pub, tampered, sig)).rejects.toThrow(
			SignatureError,
		);
	});

	test("byte-identical re-write (deterministic)", async () => {
		const a = await readFile(join(dir, "catalog.json"));
		const dir2 = await mkdtemp(join(tmpdir(), "aml-cat2-"));
		try {
			await writeSignedCatalog(
				dir2,
				buildCatalog(LISTS, FIXED_AT),
				await demoKey(),
			);
			const b = await readFile(join(dir2, "catalog.json"));
			expect(a.equals(b)).toBe(true);
		} finally {
			await rm(dir2, { recursive: true, force: true });
		}
	});
});
