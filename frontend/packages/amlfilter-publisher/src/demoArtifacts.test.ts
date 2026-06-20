// Prove the COMMITTED multi-list demo artifacts verify in-tab against the
// COMMITTED public.key (the same verifier the browser tier uses), and that a
// flipped byte is rejected fail-closed. Guards the real shipped bytes, not a
// synthetic stand-in — a bundle/key/verification regression is caught here.

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SignatureError, verifyEd25519 } from "@amlfilter/browser/engine";
import { describe, expect, test } from "vitest";
import type { Catalog } from "./catalog.ts";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const PUBLIC = resolve(HERE, "../../../app/public");
const WATCHLIST = resolve(PUBLIC, "watchlist");
const PUBLIC_KEY_PATH = resolve(PUBLIC, "public.key");

async function publicKey(): Promise<Uint8Array> {
	return new Uint8Array(await readFile(PUBLIC_KEY_PATH));
}

async function verifyPair(dir: string, name: string): Promise<void> {
	const bytes = new Uint8Array(await readFile(join(dir, name)));
	const sig = await readFile(join(dir, `${name}.sig`), "utf8");
	await expect(verifyEd25519(await publicKey(), bytes, sig)).resolves.toBe(
		undefined,
	);
	const tampered = Uint8Array.from(bytes);
	tampered[0] = (tampered[0] ?? 0) ^ 0xff;
	await expect(verifyEd25519(await publicKey(), tampered, sig)).rejects.toThrow(
		SignatureError,
	);
}

async function readCatalog(): Promise<Catalog> {
	return JSON.parse(
		await readFile(join(WATCHLIST, "catalog.json"), "utf8"),
	) as Catalog;
}

describe("committed multi-list demo artifacts verify against public.key", () => {
	test("catalog.json verifies; a flipped byte fails closed", async () => {
		await verifyPair(WATCHLIST, "catalog.json");
	});

	test("catalog lists all four lists with demo-1 versions", async () => {
		const cat = await readCatalog();
		expect(cat.schema).toBe(1);
		expect(cat.lists.map((l) => l.id)).toEqual([
			"EU_CONSOLIDATED",
			"OFAC_SDN",
			"UK_OFSI",
			"UN_CONSOLIDATED",
		]);
		for (const l of cat.lists) {
			expect(l.version).toBe("demo-1");
		}
	});

	test("each list's watchlist.json + manifest verify, flips fail closed", async () => {
		const cat = await readCatalog();
		for (const list of cat.lists) {
			const dir = join(WATCHLIST, list.path);
			await verifyPair(dir, "watchlist.json");
			await verifyPair(dir, "watchlist.manifest.json");
		}
	});

	test("OFAC demo list keeps Ivan Fakovich (alias Vanya Fakovich)", async () => {
		const ofac = JSON.parse(
			await readFile(join(WATCHLIST, "ofac", "watchlist.json"), "utf8"),
		) as { entities: { name_canonical: string; aliases: string[] }[] };
		const ivan = ofac.entities.find(
			(e) => e.name_canonical === "ivan fakovich",
		);
		expect(ivan).toBeDefined();
		expect(ivan?.aliases).toContain("Vanya Fakovich");
	});
});
