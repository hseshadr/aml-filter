// Scoped sync: fetch only the lists the visitor actually selected.
//
// /screen boots with `enabledLists: ["OFAC_SDN"]` and has since it shipped —
// but `syncIndex` walked `manifest.files` unconditionally, so the cold boot
// downloaded EU + UK + UN too and then never read them. Measured against the
// live production bundle (version 2026-08-01, 1,296 chunks / 46,714,573 bytes):
// 527 of those chunks and 18.4 MB belonged to lists /screen does not touch.
//
// The scope is deliberately expressed over manifest PATHS, not list ids: the
// sync tier is domain-agnostic (it knows chunks and files, not sanctions
// programmes), and the id -> slug mapping lives in the bundle's own catalog.
//
// FAIL-CLOSED IS NOT NEGOTIABLE HERE. A narrower scope must narrow only WHAT is
// fetched, never HOW it is checked: the pointer's ed25519 signature, the
// manifest's content-address, the per-chunk content-address, and the
// anti-rollback sequence gate all still run, and a list pulled in later gets the
// identical treatment. The last three cases below are the guards for that.

import { Zstd } from "@hpcc-js/wasm-zstd";
import { beforeAll, describe, expect, it } from "vitest";
import { SignatureError, sha256Hex } from "../crypto";
import { verifyPlaintext } from "./integrity";
import { MemoryCacheStore } from "./memoryStore";
import { syncIndex } from "./sync";
import type {
	CacheStore,
	FetchBytes,
	IndexManifest,
	Verify,
	VersionPointer,
} from "./types";

const ENCODER = new TextEncoder();
const passVerify: Verify = () => Promise.resolve();

interface MultiListBundle {
	readonly fetchBytes: FetchBytes;
	/** Every chunk hash, grouped by the list directory that owns it. */
	readonly chunksByList: ReadonlyMap<string, ReadonlyArray<string>>;
	/** URLs actually requested, in order — the measurement surface. */
	readonly requested: string[];
	readonly manifestHash: string;
}

/**
 * A miniature of the production layout: `catalog.json` plus one directory per
 * list, each with its own chunks. Chunk plaintexts are namespaced per list so no
 * chunk is shared across directories — which is also true of the real bundle
 * (verified: 0 cross-referenced chunks in the 2026-08-01 manifest).
 */
async function multiListBundle(
	sizes: Readonly<Record<string, number>>,
): Promise<MultiListBundle> {
	const zstd = await Zstd.load();
	const chunks = new Map<string, Uint8Array>();
	const chunksByList = new Map<string, ReadonlyArray<string>>();
	const files: Array<IndexManifest["files"][number]> = [];

	const addFile = async (
		path: string,
		parts: ReadonlyArray<Uint8Array>,
	): Promise<ReadonlyArray<string>> => {
		const refs = [];
		for (const bytes of parts) {
			const hash = await sha256Hex(bytes);
			chunks.set(hash, zstd.compress(bytes));
			refs.push({ hash, size: bytes.byteLength });
		}
		const joined = new Uint8Array(
			parts.reduce((sum, part) => sum + part.byteLength, 0),
		);
		let offset = 0;
		for (const part of parts) {
			joined.set(part, offset);
			offset += part.byteLength;
		}
		files.push({
			path,
			file_type: null,
			size: joined.byteLength,
			file_sha256: await sha256Hex(joined),
			chunks: refs,
		});
		return refs.map((ref) => ref.hash);
	};

	const catalogHashes = await addFile("catalog.json", [
		ENCODER.encode(
			JSON.stringify({ schemaVersion: 1, lists: Object.keys(sizes) }),
		),
	]);
	chunksByList.set("(root)", catalogHashes);

	for (const [slug, count] of Object.entries(sizes)) {
		const parts = Array.from({ length: count }, (_unused, index) =>
			ENCODER.encode(`${slug} entity row ${index}`),
		);
		chunksByList.set(slug, await addFile(`${slug}/entities.jsonl`, parts));
	}

	const manifest: IndexManifest = {
		schema_version: 2,
		bundle_id: "scoped-sync-test",
		version: "2026-08-01",
		files,
		metadata: {},
	};
	const manifestBytes = ENCODER.encode(JSON.stringify(manifest));
	const manifestHash = await sha256Hex(manifestBytes);
	const pointerBytes = ENCODER.encode(
		JSON.stringify({
			manifest_hash: manifestHash,
			version: manifest.version,
			sequence: 7,
			signature: "test-signature",
		} satisfies VersionPointer),
	);

	const requested: string[] = [];
	const fetchBytes: FetchBytes = (url) => {
		requested.push(url);
		if (url.endsWith("/latest")) {
			return Promise.resolve(pointerBytes);
		}
		if (url.endsWith(`/manifest/${manifestHash}`)) {
			return Promise.resolve(manifestBytes);
		}
		const hash = url.split("/").at(-1);
		const compressed = hash === undefined ? undefined : chunks.get(hash);
		if (compressed === undefined) {
			return Promise.reject(new Error(`unexpected ${url}`));
		}
		return Promise.resolve(compressed);
	};

	return { fetchBytes, chunksByList, requested, manifestHash };
}

/**
 * A store whose bytes for one chunk have been swapped for bytes that do not hash
 * to its content address — a poisoned cache entry, the 2026-07-13 outage shape.
 * `getChunk` runs the REAL `verifyPlaintext`, exactly as MemoryCacheStore and
 * OpfsCacheStore do, so the poison is caught by production code and not by the
 * decorator. Anything that never READS the chunk never notices, which is the
 * property the top-up guard below is measuring.
 */
class PoisonableStore implements CacheStore {
	readonly #inner = new MemoryCacheStore();
	readonly #poisoned = new Map<string, Uint8Array>();

	public poison(chunkHash: string, plaintext: Uint8Array): void {
		this.#poisoned.set(chunkHash, plaintext);
	}

	public hasChunk(chunkHash: string): Promise<boolean> {
		return this.#poisoned.has(chunkHash)
			? Promise.resolve(true)
			: this.#inner.hasChunk(chunkHash);
	}

	public putChunkCompressed(
		chunkHash: string,
		compressed: Uint8Array,
	): Promise<void> {
		return this.#inner.putChunkCompressed(chunkHash, compressed);
	}

	public async getChunk(chunkHash: string): Promise<Uint8Array> {
		const tampered = this.#poisoned.get(chunkHash);
		if (tampered === undefined) {
			return this.#inner.getChunk(chunkHash);
		}
		await verifyPlaintext(chunkHash, tampered);
		return tampered;
	}

	public putManifest(manifestBytes: Uint8Array): Promise<string> {
		return this.#inner.putManifest(manifestBytes);
	}

	public getManifest(manifestHash: string): Promise<Uint8Array> {
		return this.#inner.getManifest(manifestHash);
	}

	public readActive(): Promise<VersionPointer | null> {
		return this.#inner.readActive();
	}

	public promote(pointer: VersionPointer): Promise<void> {
		return this.#inner.promote(pointer);
	}

	public clear(): Promise<void> {
		this.#poisoned.clear();
		return this.#inner.clear();
	}
}

/** Which list directories the sync actually pulled chunks for. */
function listsTouched(
	bundle: MultiListBundle,
	requested: ReadonlyArray<string>,
): ReadonlySet<string> {
	const fetchedHashes = new Set(
		requested
			.filter((url) => url.includes("/chunk/"))
			.map((url) => url.split("/").at(-1)),
	);
	const touched = new Set<string>();
	for (const [list, hashes] of bundle.chunksByList) {
		if (hashes.some((hash) => fetchedHashes.has(hash))) {
			touched.add(list);
		}
	}
	return touched;
}

describe("syncIndex list scoping", () => {
	let bundle: MultiListBundle;

	beforeAll(async () => {
		// Rough proportions of the real bundle: ofac dominates, un is tiny.
		bundle = await multiListBundle({ ofac: 12, eu: 5, uk: 4, un: 2 });
	});

	it("fetches every list when no scope is given (unchanged default)", async () => {
		const requested: string[] = [];
		const result = await syncIndex({
			baseUrl: "/bundle/origin",
			store: new MemoryCacheStore(),
			fetchBytes: (url, options) => {
				requested.push(url);
				return bundle.fetchBytes(url, options);
			},
			verify: passVerify,
		});

		expect(result.chunksFetched).toBe(12 + 5 + 4 + 2 + 1);
		expect(listsTouched(bundle, requested)).toEqual(
			new Set(["(root)", "ofac", "eu", "uk", "un"]),
		);
	});

	it("fetches ONLY the scoped list's chunks", async () => {
		const requested: string[] = [];
		const result = await syncIndex({
			baseUrl: "/bundle/origin",
			store: new MemoryCacheStore(),
			fetchBytes: (url, options) => {
				requested.push(url);
				return bundle.fetchBytes(url, options);
			},
			verify: passVerify,
			wantedPaths: ["catalog.json", "ofac/"],
		});

		expect(result.chunksFetched).toBe(12 + 1);
		expect(listsTouched(bundle, requested)).toEqual(
			new Set(["(root)", "ofac"]),
		);
	});

	it("tops up incrementally when a list is enabled later", async () => {
		const store = new MemoryCacheStore();
		const base = {
			baseUrl: "/bundle/origin",
			store,
			fetchBytes: bundle.fetchBytes,
			verify: passVerify,
		};

		const cold = await syncIndex({
			...base,
			wantedPaths: ["catalog.json", "ofac/"],
		});
		expect(cold.chunksFetched).toBe(13);

		// The visitor enables EU in Settings. This must fetch EU's chunks and
		// NOTHING else — the whole point of a content-addressed, chunked store.
		const requested: string[] = [];
		const topUp = await syncIndex({
			...base,
			fetchBytes: (url, options) => {
				requested.push(url);
				return bundle.fetchBytes(url, options);
			},
			wantedPaths: ["catalog.json", "ofac/", "eu/"],
		});

		expect(topUp.chunksFetched).toBe(5);
		expect(topUp.chunksReused).toBe(13);
		expect(listsTouched(bundle, requested)).toEqual(new Set(["eu"]));
	});

	it("re-verifies a later-enabled list instead of trusting it because it is local", async () => {
		// GUARD: a list pulled in later gets the SAME treatment as one loaded at
		// boot. EU's chunks are already present but one is poisoned. The sync that
		// brings EU INTO scope must read (and therefore verify) it — a scoping bug
		// that left EU out of `verifyReusedChunks` would promote the poison
		// silently, which is the whole risk of narrowing what gets walked.
		const store = new PoisonableStore();
		const base = {
			baseUrl: "/bundle/origin",
			store,
			fetchBytes: bundle.fetchBytes,
			verify: passVerify,
		};
		// Cold boot with OFAC only; EU's chunks arrive in a later top-up.
		await syncIndex({ ...base, wantedPaths: ["catalog.json", "ofac/"] });
		await syncIndex({ ...base, wantedPaths: ["catalog.json", "ofac/", "eu/"] });

		const poisoned = (bundle.chunksByList.get("eu") ?? [])[0];
		expect(poisoned).toBeDefined();
		store.poison(poisoned as string, ENCODER.encode("tampered eu row"));

		// A re-sync with EU in scope must catch it, fail-closed, before promotion.
		await expect(
			syncIndex({ ...base, wantedPaths: ["catalog.json", "ofac/", "eu/"] }),
		).rejects.toMatchObject({ name: "IntegrityError" });

		// And the control: with EU OUT of scope the poisoned chunk is never read,
		// so this sync legitimately succeeds. That asymmetry is what proves the
		// assertion above is actually measuring the scoped verification walk and
		// not some unrelated whole-store check.
		await expect(
			syncIndex({ ...base, wantedPaths: ["catalog.json", "ofac/"] }),
		).resolves.toMatchObject({ version: "2026-08-01" });
	});

	it("still fails closed on a bad pointer signature when scoped", async () => {
		// What the real verifier throws (crypto.ts's verifyEd25519), not a stand-in.
		const rejectVerify: Verify = () => Promise.reject(new SignatureError());

		await expect(
			syncIndex({
				baseUrl: "/bundle/origin",
				store: new MemoryCacheStore(),
				fetchBytes: bundle.fetchBytes,
				verify: rejectVerify,
				wantedPaths: ["catalog.json", "ofac/"],
			}),
		).rejects.toMatchObject({ name: "SignatureError" });
	});

	it("still rejects a rollback when scoped", async () => {
		const store = new MemoryCacheStore();
		await store.promote({
			manifest_hash: "0".repeat(64),
			version: "2099-01-01",
			sequence: 99,
			signature: "x",
		});

		await expect(
			syncIndex({
				baseUrl: "/bundle/origin",
				store,
				fetchBytes: bundle.fetchBytes,
				verify: passVerify,
				wantedPaths: ["catalog.json", "ofac/"],
			}),
		).rejects.toMatchObject({ name: "RollbackError" });
	});

	it("sizes the storage preflight against the scope, not the whole bundle", async () => {
		// A device with room for OFAC but not for all four lists must be allowed to
		// boot — the preflight has to measure what will actually be fetched.
		const seen: number[] = [];
		await syncIndex({
			baseUrl: "/bundle/origin",
			store: new MemoryCacheStore(),
			fetchBytes: bundle.fetchBytes,
			verify: passVerify,
			wantedPaths: ["catalog.json", "ofac/"],
			estimateStorage: () => {
				seen.push(1);
				return Promise.resolve({ quota: 1_000_000, usage: 0 });
			},
		});
		expect(seen).toHaveLength(1);

		// And the unscoped preflight must still see the bigger number: give it a
		// quota that fits OFAC only, and the all-lists sync must refuse.
		const tight = { quota: 260, usage: 0 };
		await expect(
			syncIndex({
				baseUrl: "/bundle/origin",
				store: new MemoryCacheStore(),
				fetchBytes: bundle.fetchBytes,
				verify: passVerify,
				estimateStorage: () => Promise.resolve(tight),
			}),
		).rejects.toMatchObject({ name: "QuotaError" });
	});
});
