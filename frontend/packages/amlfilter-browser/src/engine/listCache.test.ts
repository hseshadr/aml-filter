// Durable list-cache tests (Theme C). The cache is a BYTE store, not a trust
// store: it persists the verified raw artifact bytes + the detached signature
// per key so a cold start can re-verify-then-parse offline. These tests run
// against fake-indexeddb (wired in vite.config.ts setupFiles) since jsdom has
// no IndexedDB; the real IndexedDB path is exercised by the offline browser e2e.

import { afterEach, describe, expect, it } from "vitest";
import {
	CATALOG_CACHE_KEY,
	type CachedArtifact,
	clearAll,
	deleteArtifact,
	listCached,
	openListCache,
	readArtifact,
	writeArtifact,
} from "./listCache";

const ENCODER = new TextEncoder();

/** A CachedArtifact for `key` carrying the given JSON text as its bytes. */
function artifactFor(
	key: string,
	version: string,
	text: string,
	signatureBase64 = "sig-base64",
): CachedArtifact {
	const bytes = ENCODER.encode(text).buffer;
	return {
		key,
		version,
		bytes,
		signatureBase64,
		cachedAt: "2026-06-20T00:00:00Z",
	};
}

afterEach(async () => {
	await clearAll();
});

describe("listCache — durable byte store", () => {
	it("write then read round-trips the bytes + signature + version", async () => {
		await writeArtifact(artifactFor("OFAC_SDN", "demo-1", '{"x":1}'));

		const got = await readArtifact("OFAC_SDN");

		expect(got).not.toBeNull();
		expect(got?.version).toBe("demo-1");
		expect(got?.signatureBase64).toBe("sig-base64");
		expect(new TextDecoder().decode(got?.bytes)).toBe('{"x":1}');
	});

	it("readArtifact returns null for a key that was never written", async () => {
		expect(await readArtifact("MISSING")).toBeNull();
	});

	it("a version bump OVERWRITES the prior artifact (single current version)", async () => {
		await writeArtifact(artifactFor("OFAC_SDN", "demo-1", '{"v":1}'));
		await writeArtifact(artifactFor("OFAC_SDN", "demo-2", '{"v":2}'));

		const got = await readArtifact("OFAC_SDN");

		expect(got?.version).toBe("demo-2");
		expect(new TextDecoder().decode(got?.bytes)).toBe('{"v":2}');
		// Exactly one row for the key — the bump evicted demo-1.
		const keys = await listCached();
		expect(keys.filter((k) => k === "OFAC_SDN")).toHaveLength(1);
	});

	it("deleteArtifact removes a single key, leaving the rest", async () => {
		await writeArtifact(artifactFor("OFAC_SDN", "v", "a"));
		await writeArtifact(artifactFor("EU_CONSOLIDATED", "v", "b"));

		await deleteArtifact("OFAC_SDN");

		expect(await readArtifact("OFAC_SDN")).toBeNull();
		expect(await readArtifact("EU_CONSOLIDATED")).not.toBeNull();
	});

	it("listCached returns every stored key including the catalog key", async () => {
		await writeArtifact(artifactFor(CATALOG_CACHE_KEY, "c", "{}"));
		await writeArtifact(artifactFor("OFAC_SDN", "v", "a"));

		const keys = await listCached();

		expect(new Set(keys)).toEqual(new Set([CATALOG_CACHE_KEY, "OFAC_SDN"]));
	});

	it("clearAll empties the store", async () => {
		await writeArtifact(artifactFor("OFAC_SDN", "v", "a"));
		await writeArtifact(artifactFor(CATALOG_CACHE_KEY, "c", "{}"));

		await clearAll();

		expect(await listCached()).toEqual([]);
	});

	it("openListCache resolves a usable database handle", async () => {
		const db = await openListCache();
		expect(typeof db.close).toBe("function");
		db.close();
	});
});
