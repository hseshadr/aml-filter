// Regression coverage for the 2026-07-13 production outage: a zero-byte
// chunk/<hash> file stranded in OPFS by an interrupted write. getFileHandle
// (create:true) creates the durable entry BEFORE any bytes land, so a tab
// killed mid-sync leaves an empty file; hasChunk() then reported it present
// forever, sync never re-fetched it, and every boot failed fail-closed with
// "chunk <hash> failed content-address check" — Retry could never heal.
//
// These tests run OpfsCacheStore against a minimal in-memory OPFS fake and
// pin the self-healing contract (the missing half of edge-proc cas.py's
// _verify_or_remove): a zero-byte chunk is treated as absent, a corrupt chunk
// is evicted on read, and a failed write never strands an entry — so the very
// next sync re-fetches and recovers.

import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyEd25519 } from "../crypto";
import {
	chunkBytes,
	latestBytes,
	manifestBytes,
	originFetch,
	pubkeyRaw,
} from "./fixtures";
import { IntegrityError } from "./integrity";
import { OpfsCacheStore } from "./opfsStore";
import { syncIndex } from "./sync";
import type { IndexManifest, Verify, VersionPointer } from "./types";

const DECODER = new TextDecoder();
const PUBKEY = pubkeyRaw();
const BASE = "https://origin.test/bundle/origin";

const realVerify: Verify = (message, signature) =>
	verifyEd25519(PUBKEY, message, signature);

// --- a minimal in-memory OPFS fake (just the surface OpfsCacheStore uses) ---

interface FakeFile {
	data: Uint8Array;
	failWrites: boolean;
}

class FakeSyncAccessHandle {
	readonly #file: FakeFile;

	public constructor(file: FakeFile) {
		this.#file = file;
	}

	public getSize(): number {
		return this.#file.data.byteLength;
	}

	public read(buffer: Uint8Array, options: { at: number }): number {
		const slice = this.#file.data.subarray(
			options.at,
			options.at + buffer.byteLength,
		);
		buffer.set(slice);
		return slice.byteLength;
	}

	public write(data: Uint8Array, options: { at: number }): number {
		if (this.#file.failWrites) {
			throw new DOMException("fake quota exhausted", "QuotaExceededError");
		}
		const end = options.at + data.byteLength;
		const grown = new Uint8Array(Math.max(this.#file.data.byteLength, end));
		grown.set(this.#file.data);
		grown.set(data, options.at);
		this.#file.data = grown;
		return data.byteLength;
	}

	// truncate stays writable even when writes fail: the real interruption
	// window is exactly "truncated, then the write never happened".
	public truncate(size: number): void {
		this.#file.data = this.#file.data.slice(0, size);
	}

	public flush(): void {}

	public close(): void {}
}

class FakeFileHandle {
	public readonly kind = "file";
	public readonly name: string;
	readonly #file: FakeFile;

	public constructor(name: string, file: FakeFile) {
		this.name = name;
		this.#file = file;
	}

	// Only `.size` is consumed (hasChunk's zero-byte probe); a full File is
	// not needed for the fake.
	public getFile(): Promise<{ readonly size: number }> {
		return Promise.resolve({ size: this.#file.data.byteLength });
	}

	public createSyncAccessHandle(): Promise<FakeSyncAccessHandle> {
		return Promise.resolve(new FakeSyncAccessHandle(this.#file));
	}
}

class FakeDirectoryHandle {
	public readonly kind = "directory";
	public readonly files = new Map<string, FakeFile>();
	public readonly dirs = new Map<string, FakeDirectoryHandle>();
	/** Names whose next data write throws (simulates quota/interruption). */
	public readonly failWrites = new Set<string>();

	public getDirectoryHandle(
		name: string,
		options?: { create?: boolean },
	): Promise<FakeDirectoryHandle> {
		const existing = this.dirs.get(name);
		if (existing !== undefined) {
			return Promise.resolve(existing);
		}
		if (options?.create !== true) {
			return Promise.reject(new DOMException(`${name}`, "NotFoundError"));
		}
		const dir = new FakeDirectoryHandle();
		this.dirs.set(name, dir);
		return Promise.resolve(dir);
	}

	public getFileHandle(
		name: string,
		options?: { create?: boolean },
	): Promise<FakeFileHandle> {
		let file = this.files.get(name);
		if (file === undefined) {
			if (options?.create !== true) {
				return Promise.reject(new DOMException(`${name}`, "NotFoundError"));
			}
			// Mirrors the real API: the entry is durably created EMPTY here,
			// before any bytes are written — the poisoning seam.
			file = { data: new Uint8Array(0), failWrites: this.failWrites.has(name) };
			this.files.set(name, file);
		}
		return Promise.resolve(new FakeFileHandle(name, file));
	}

	public removeEntry(
		name: string,
		_options?: FileSystemRemoveOptions,
	): Promise<void> {
		if (this.files.delete(name) || this.dirs.delete(name)) {
			return Promise.resolve();
		}
		return Promise.reject(new DOMException(`${name}`, "NotFoundError"));
	}
}

function mustGet<K, V>(map: Map<K, V>, key: K): V {
	const value = map.get(key);
	if (value === undefined) {
		throw new Error(`fake OPFS is missing entry ${String(key)}`);
	}
	return value;
}

async function openStore(): Promise<{
	store: OpfsCacheStore;
	root: FakeDirectoryHandle;
}> {
	const root = new FakeDirectoryHandle();
	vi.stubGlobal("navigator", {
		storage: {
			getDirectory: () =>
				Promise.resolve(root as unknown as FileSystemDirectoryHandle),
		},
	});
	const store = await OpfsCacheStore.open();
	return { store, root };
}

function chunkDirOf(root: FakeDirectoryHandle): FakeDirectoryHandle {
	return mustGet(root.dirs, "chunk");
}

function realPointer(): VersionPointer {
	return JSON.parse(DECODER.decode(latestBytes())) as VersionPointer;
}

function realManifest(): IndexManifest {
	return JSON.parse(
		DECODER.decode(manifestBytes(realPointer().manifest_hash)),
	) as IndexManifest;
}

/** Two distinct chunk hashes from the committed signed fixture bundle. */
function twoFixtureChunkHashes(): [string, string] {
	const hashes = new Set<string>();
	for (const entry of realManifest().files) {
		for (const ref of entry.chunks) {
			hashes.add(ref.hash);
		}
	}
	const [first, second] = [...hashes];
	if (first === undefined || second === undefined) {
		throw new Error("fixture bundle has fewer than two distinct chunks");
	}
	return [first, second];
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("OpfsCacheStore poisoned-chunk self-healing", () => {
	it("treats a zero-byte chunk file (interrupted write) as absent", async () => {
		const { store, root } = await openStore();
		const [hash] = twoFixtureChunkHashes();
		await store.putChunkCompressed(hash, chunkBytes(hash));
		await expect(store.hasChunk(hash)).resolves.toBe(true);

		// Simulate the interruption: the durable entry exists, no bytes landed.
		mustGet(chunkDirOf(root).files, hash).data = new Uint8Array(0);

		await expect(store.hasChunk(hash)).resolves.toBe(false);
	});

	it("evicts a chunk whose bytes decompress to the wrong content", async () => {
		const { store, root } = await openStore();
		const [hash, otherHash] = twoFixtureChunkHashes();
		await store.putChunkCompressed(hash, chunkBytes(hash));

		// Valid zstd, wrong plaintext: another chunk's bytes under this name —
		// the exact "failed content-address check" seen in production.
		mustGet(chunkDirOf(root).files, hash).data = chunkBytes(otherHash);

		await expect(store.getChunk(hash)).rejects.toThrow(
			/failed content-address check/,
		);
		expect(chunkDirOf(root).files.has(hash)).toBe(false);
		await expect(store.hasChunk(hash)).resolves.toBe(false);
	});

	it("evicts a chunk whose bytes are not zstd at all", async () => {
		const { store, root } = await openStore();
		const [hash] = twoFixtureChunkHashes();
		await store.putChunkCompressed(hash, chunkBytes(hash));

		mustGet(chunkDirOf(root).files, hash).data = new Uint8Array(64).fill(7);

		await expect(store.getChunk(hash)).rejects.toBeInstanceOf(IntegrityError);
		expect(chunkDirOf(root).files.has(hash)).toBe(false);
	});

	it("does not strand an entry when the chunk write itself fails", async () => {
		const { store, root } = await openStore();
		const [hash] = twoFixtureChunkHashes();
		chunkDirOf(root).failWrites.add(hash);

		await expect(
			store.putChunkCompressed(hash, chunkBytes(hash)),
		).rejects.toThrow(/quota/);
		expect(chunkDirOf(root).files.has(hash)).toBe(false);
	});
});

describe("syncIndex against an OPFS store poisoned by an interrupted write (prod outage 2026-07-13)", () => {
	it("silently re-fetches a zero-byte chunk on the next sync", async () => {
		const { store, root } = await openStore();
		const { fetchBytes, chunkRequests } = originFetch();
		await syncIndex({ baseUrl: BASE, store, fetchBytes, verify: realVerify });

		const [poisoned] = twoFixtureChunkHashes();
		mustGet(chunkDirOf(root).files, poisoned).data = new Uint8Array(0);
		const requestsBefore = chunkRequests().length;

		// Pre-fix behavior: rejects "chunk <hash> failed content-address check"
		// on every run, forever. Post-fix: the empty entry counts as missing,
		// so this sync re-fetches it and completes.
		await expect(
			syncIndex({ baseUrl: BASE, store, fetchBytes, verify: realVerify }),
		).resolves.toBeDefined();
		expect(chunkRequests().slice(requestsBefore)).toContain(poisoned);
		await expect(store.getChunk(poisoned)).resolves.toBeInstanceOf(Uint8Array);
	});

	it("fails closed once on a corrupt non-empty chunk, then heals on retry", async () => {
		const { store, root } = await openStore();
		const { fetchBytes, chunkRequests } = originFetch();
		await syncIndex({ baseUrl: BASE, store, fetchBytes, verify: realVerify });

		const [poisoned, otherHash] = twoFixtureChunkHashes();
		mustGet(chunkDirOf(root).files, poisoned).data = chunkBytes(otherHash);

		// Fail-closed is preserved: corrupt bytes are never served or promoted.
		await expect(
			syncIndex({ baseUrl: BASE, store, fetchBytes, verify: realVerify }),
		).rejects.toThrow(/failed content-address check/);

		// But the poisoned entry was evicted, so the retry re-fetches + heals —
		// this is the assertion that fails on the pre-fix code (permanent outage).
		const requestsBefore = chunkRequests().length;
		await expect(
			syncIndex({ baseUrl: BASE, store, fetchBytes, verify: realVerify }),
		).resolves.toBeDefined();
		expect(chunkRequests().slice(requestsBefore)).toContain(poisoned);
	});
});

describe("OpfsCacheStore manifest + active-pointer roundtrip", () => {
	it("stores and re-reads the manifest and active pointer, and clear() resets", async () => {
		const { store } = await openStore();
		const pointer = realPointer();
		const manifestRaw = manifestBytes(pointer.manifest_hash);

		await expect(store.readActive()).resolves.toBeNull();
		const storedHash = await store.putManifest(manifestRaw);
		expect(storedHash).toBe(pointer.manifest_hash);
		await expect(store.getManifest(storedHash)).resolves.toEqual(manifestRaw);
		await store.promote(pointer);
		await expect(store.readActive()).resolves.toEqual(pointer);

		await store.clear();
		await expect(store.readActive()).resolves.toBeNull();
		await expect(store.getManifest(storedHash)).rejects.toThrow();
	});
});
