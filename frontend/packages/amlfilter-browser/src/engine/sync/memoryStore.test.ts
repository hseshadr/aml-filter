import { describe, expect, it } from "vitest";
import { chunkBytes } from "./fixtures";
import { IntegrityError } from "./integrity";
import { MemoryCacheStore } from "./memoryStore";

// A real chunk hash from the committed OFAC bundle fixture.
const REAL_CHUNK =
	"08863d0526fbcb36e14ca536ff613d7dfd6d07975e35cb4607a0749e4df7515d";

describe("MemoryCacheStore content-address integrity", () => {
	it("ingests a real chunk under its true hash and reads it back", async () => {
		const store = new MemoryCacheStore();
		expect(await store.hasChunk(REAL_CHUNK)).toBe(false);
		await store.putChunkCompressed(REAL_CHUNK, chunkBytes(REAL_CHUNK));
		expect(await store.hasChunk(REAL_CHUNK)).toBe(true);
		const plaintext = await store.getChunk(REAL_CHUNK);
		expect(plaintext.byteLength).toBeGreaterThan(0);
	});

	it("rejects a chunk stored under the wrong hash (fail-closed)", async () => {
		const store = new MemoryCacheStore();
		const wrongHash = "0".repeat(64);
		await expect(
			store.putChunkCompressed(wrongHash, chunkBytes(REAL_CHUNK)),
		).rejects.toBeInstanceOf(IntegrityError);
		expect(await store.hasChunk(wrongHash)).toBe(false);
	});

	it("rejects non-zstd bytes (decompress failure is an IntegrityError)", async () => {
		const store = new MemoryCacheStore();
		await expect(
			store.putChunkCompressed(REAL_CHUNK, new Uint8Array([1, 2, 3, 4])),
		).rejects.toBeInstanceOf(IntegrityError);
	});

	it("round-trips a manifest and reads the active pointer", async () => {
		const store = new MemoryCacheStore();
		const bytes = new TextEncoder().encode(
			'{"manifest_hash":"h","version":"v1"}',
		);
		const hash = await store.putManifest(bytes);
		expect(await store.getManifest(hash)).toEqual(bytes);
		expect(await store.readActive()).toBeNull();
		await store.promote({ manifest_hash: "h", version: "v1", signature: "s" });
		expect((await store.readActive())?.version).toBe("v1");
	});

	it("getChunk on an absent hash fails closed", async () => {
		const store = new MemoryCacheStore();
		await expect(store.getChunk("0".repeat(64))).rejects.toThrow(
			/not in store/,
		);
	});

	it("getManifest on an absent hash fails closed", () => {
		const store = new MemoryCacheStore();
		expect(() => store.getManifest("0".repeat(64))).toThrow(/not in store/);
	});

	it("clear drops chunks, manifests, and the active pointer", async () => {
		const store = new MemoryCacheStore();
		await store.putChunkCompressed(REAL_CHUNK, chunkBytes(REAL_CHUNK));
		const manifestHash = await store.putManifest(
			new TextEncoder().encode("{}"),
		);
		await store.promote({ manifest_hash: "h", version: "v1", signature: "s" });

		await store.clear();

		expect(await store.hasChunk(REAL_CHUNK)).toBe(false);
		expect(() => store.getManifest(manifestHash)).toThrow(/not in store/);
		expect(await store.readActive()).toBeNull();
	});
});
