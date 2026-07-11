// publishWatchlist defaults: with no explicit listId and no entities to infer
// one from, the list id falls back to "OFAC_SDN"; with no injected generatedAt
// a fresh ISO instant is stamped. Driven through the in-memory sourceLines
// input with the fake embedder and a throwaway key; asserts the real signed
// pair lands on disk.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createFakeEmbedder } from "./fakeEmbedder.ts";
import { publishWatchlist } from "./publisher.ts";

// Throwaway 32-byte key (NOT the demo key — defaults tests need no cross-compat).
const TEST_KEY = new Uint8Array(32).fill(9);

describe("publishWatchlist defaults", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "aml-pub-edge-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	test("empty sourceLines fall back to OFAC_SDN and stamp a fresh generatedAt", async () => {
		const before = Date.now();
		const manifest = await publishWatchlist({
			sourceLines: [],
			version: "edge-1",
			privateKey: TEST_KEY,
			outDir: dir,
			embedder: createFakeEmbedder(),
		});
		expect(manifest.listId).toBe("OFAC_SDN");
		expect(manifest.entitiesCount).toBe(0);
		const at = Date.parse(manifest.generatedAt);
		expect(at).toBeGreaterThanOrEqual(before - 1000);
		expect(at).toBeLessThanOrEqual(Date.now() + 1000);
		// The signed pair really lands on disk.
		const watchlist = await readFile(join(dir, "watchlist.json"), "utf8");
		const signature = await readFile(join(dir, "watchlist.json.sig"), "utf8");
		expect(watchlist).toContain('"listId": "OFAC_SDN"');
		expect(signature.length).toBeGreaterThan(0);
	});
});
