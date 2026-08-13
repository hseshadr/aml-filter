import { Zstd } from "@hpcc-js/wasm-zstd";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../crypto";
import { IndexedDbCacheStore } from "./indexedDbStore";

async function compressForTest(plaintext: Uint8Array): Promise<Uint8Array> {
	const zstd = await Zstd.load();
	return zstd.compress(plaintext);
}

let nextDatabase = 0;

async function openStore(): Promise<IndexedDbCacheStore> {
	nextDatabase += 1;
	return IndexedDbCacheStore.open(indexedDB, `aml-filter-test-${nextDatabase}`);
}

async function putRaw(
	databaseName: string,
	key: string,
	bytes: Uint8Array,
): Promise<void> {
	const database = await new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(databaseName, 1);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
	await new Promise<void>((resolve, reject) => {
		const transaction = database.transaction("entries", "readwrite");
		transaction.objectStore("entries").put(new Uint8Array(bytes).buffer, key);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
	});
	database.close();
}

describe("IndexedDbCacheStore", () => {
	it("persists compressed chunks and re-verifies them after reopening", async () => {
		const databaseName = `aml-filter-test-reopen-${nextDatabase++}`;
		const plaintext = new TextEncoder().encode("signed watchlist chunk");
		const hash = await sha256Hex(plaintext);
		const first = await IndexedDbCacheStore.open(indexedDB, databaseName);
		await first.putChunkCompressed(hash, await compressForTest(plaintext));
		first.close();

		const reopened = await IndexedDbCacheStore.open(indexedDB, databaseName);
		expect(await reopened.hasChunk(hash)).toBe(true);
		expect(Array.from(await reopened.getChunk(hash))).toEqual(
			Array.from(plaintext),
		);
	});

	it("rejects a chunk whose content address does not match", async () => {
		const store = await openStore();
		const plaintext = new TextEncoder().encode("wrong bytes");
		await expect(
			store.putChunkCompressed(
				"0".repeat(64),
				await compressForTest(plaintext),
			),
		).rejects.toThrow(/content-address/i);
	});

	it("evicts a cached chunk that fails read-time verification", async () => {
		const databaseName = `aml-filter-test-poison-${nextDatabase++}`;
		const store = await IndexedDbCacheStore.open(indexedDB, databaseName);
		const expected = new TextEncoder().encode("expected bytes");
		const hash = await sha256Hex(expected);
		await putRaw(
			databaseName,
			`chunk/${hash}`,
			await compressForTest(new TextEncoder().encode("poisoned bytes")),
		);

		await expect(store.getChunk(hash)).rejects.toThrow(/content-address/i);
		expect(await store.hasChunk(hash)).toBe(false);
	});

	it("persists manifests and the monotonic active pointer", async () => {
		const databaseName = `aml-filter-test-pointer-${nextDatabase++}`;
		const store = await IndexedDbCacheStore.open(indexedDB, databaseName);
		const manifest = new TextEncoder().encode('{"files":[]}');
		const hash = await store.putManifest(manifest);
		const pointer = {
			manifest_hash: hash,
			version: "2026-08-13",
			sequence: 70,
			signature: "signed",
		};
		await store.promote(pointer);
		store.close();
		const reopened = await IndexedDbCacheStore.open(indexedDB, databaseName);

		expect(Array.from(await reopened.getManifest(hash))).toEqual(
			Array.from(manifest),
		);
		expect(await reopened.readActive()).toEqual(pointer);
	});

	it("rejects a cached manifest that fails its content address", async () => {
		const databaseName = `aml-filter-test-manifest-${nextDatabase++}`;
		const store = await IndexedDbCacheStore.open(indexedDB, databaseName);
		const manifest = new TextEncoder().encode('{"files":[]}');
		const hash = await store.putManifest(manifest);
		await putRaw(
			databaseName,
			`manifest/${hash}`,
			new TextEncoder().encode('{"files":["tampered"]}'),
		);

		await expect(store.getManifest(hash)).rejects.toThrow(/content-address/i);
	});

	it("clears every persisted representation", async () => {
		const store = await openStore();
		const plaintext = new TextEncoder().encode("chunk");
		const hash = await sha256Hex(plaintext);
		await store.putChunkCompressed(hash, await compressForTest(plaintext));
		await store.putManifest(new TextEncoder().encode("manifest"));
		await store.promote({
			manifest_hash: "a".repeat(64),
			version: "v1",
			sequence: 1,
			signature: "signed",
		});

		await store.clear();

		expect(await store.hasChunk(hash)).toBe(false);
		expect(await store.readActive()).toBeNull();
	});
});
