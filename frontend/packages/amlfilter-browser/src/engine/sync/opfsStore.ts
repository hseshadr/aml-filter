// OPFS-backed CacheStore — the browser tier's content-addressed store. Runs in
// a Web Worker (createSyncAccessHandle is Worker-only). Mirrors edge-proc's
// FilesystemCacheStore: chunk/<hash> holds verbatim zstd, manifest/<hash> holds
// the manifest bytes, active holds the promoted VersionPointer. The read path is
// always decompress → re-hash → compare (fail-closed). Store this verbatim so a
// patch re-sync can prove only-changed-chunks were fetched.
//
// Self-healing (the remove half of edge-proc cas.py's _verify_or_remove, and
// the fix for the 2026-07-13 production outage): getFileHandle(create:true)
// creates the durable entry BEFORE any bytes land, so an interrupted sync can
// strand a zero-byte chunk file. A store that only fails closed on such a file
// bricks the app forever — hasChunk() reports it present, sync never
// re-fetches it, and every boot dies with "failed content-address check".
// Therefore: a zero-byte chunk counts as absent, a chunk that fails its
// integrity check on read is evicted before the error propagates, and a failed
// write removes whatever partial entry it created — the next sync re-fetches
// and recovers instead of failing permanently.

import { sha256Hex } from "../crypto";
import { decompressAndVerify, IntegrityError } from "./integrity";
import { isQuotaExceeded, QuotaError } from "./storage";
import type { CacheStore, VersionPointer } from "./types";

const CHUNK_DIR = "chunk";
const MANIFEST_DIR = "manifest";
const ACTIVE_FILE = "active";

const DECODER = new TextDecoder();
const ENCODER = new TextEncoder();

function readHandle(handle: FileSystemSyncAccessHandle): Uint8Array {
	const size = handle.getSize();
	const buffer = new Uint8Array(size);
	handle.read(buffer, { at: 0 });
	return buffer;
}

function writeHandle(
	handle: FileSystemSyncAccessHandle,
	data: Uint8Array,
): void {
	handle.truncate(0);
	handle.write(data, { at: 0 });
	handle.flush();
}

export class OpfsCacheStore implements CacheStore {
	readonly #root: FileSystemDirectoryHandle;
	// Reassigned by clear(): the chunk/manifest subdirs are removed recursively and
	// re-created, so the handles must be mutable.
	#chunkDir: FileSystemDirectoryHandle;
	#manifestDir: FileSystemDirectoryHandle;

	private constructor(
		root: FileSystemDirectoryHandle,
		chunkDir: FileSystemDirectoryHandle,
		manifestDir: FileSystemDirectoryHandle,
	) {
		this.#root = root;
		this.#chunkDir = chunkDir;
		this.#manifestDir = manifestDir;
	}

	/** Open (or create) the OPFS store root + chunk/manifest subdirs. */
	public static async open(): Promise<OpfsCacheStore> {
		const root = await navigator.storage.getDirectory();
		const chunkDir = await root.getDirectoryHandle(CHUNK_DIR, { create: true });
		const manifestDir = await root.getDirectoryHandle(MANIFEST_DIR, {
			create: true,
		});
		return new OpfsCacheStore(root, chunkDir, manifestDir);
	}

	public async hasChunk(chunkHash: string): Promise<boolean> {
		try {
			const fileHandle = await this.#chunkDir.getFileHandle(chunkHash);
			// A zero-byte entry is an interrupted write (created, never written),
			// not a chunk: report it absent so the next sync re-fetches it.
			return (await fileHandle.getFile()).size > 0;
		} catch {
			return false;
		}
	}

	public async putChunkCompressed(
		chunkHash: string,
		compressed: Uint8Array,
	): Promise<void> {
		// Verify BEFORE landing it (fail-closed): a bad chunk never reaches OPFS.
		await decompressAndVerify(chunkHash, compressed);
		await this.writeFile(this.#chunkDir, chunkHash, compressed);
	}

	public async getChunk(chunkHash: string): Promise<Uint8Array> {
		const compressed = await this.readFile(this.#chunkDir, chunkHash);
		try {
			return await decompressAndVerify(chunkHash, compressed);
		} catch (error) {
			if (error instanceof IntegrityError) {
				// Evict the poisoned file (fail-closed stays intact — the error
				// still propagates) so the next sync re-fetches it instead of
				// failing on the same bytes forever.
				await this.#evictChunk(chunkHash);
			}
			throw error;
		}
	}

	public async putManifest(manifestBytes: Uint8Array): Promise<string> {
		const manifestHash = await sha256Hex(manifestBytes);
		await this.writeFile(this.#manifestDir, manifestHash, manifestBytes);
		return manifestHash;
	}

	public async getManifest(manifestHash: string): Promise<Uint8Array> {
		const raw = await this.readFile(this.#manifestDir, manifestHash);
		if ((await sha256Hex(raw)) !== manifestHash) {
			throw new IntegrityError(
				`manifest ${manifestHash} failed content-address check`,
			);
		}
		return raw;
	}

	public async readActive(): Promise<VersionPointer | null> {
		try {
			const raw = await this.readFile(this.#root, ACTIVE_FILE);
			return JSON.parse(DECODER.decode(raw)) as VersionPointer;
		} catch {
			return null;
		}
	}

	public async promote(pointer: VersionPointer): Promise<void> {
		await this.writeFile(
			this.#root,
			ACTIVE_FILE,
			ENCODER.encode(JSON.stringify(pointer)),
		);
	}

	/** Drop every chunk + manifest + the active pointer, then re-open empty
	 * chunk/manifest subdirs so the store stays reusable (next sync re-fetches). */
	public async clear(): Promise<void> {
		await this.#removeIfPresent(CHUNK_DIR, { recursive: true });
		await this.#removeIfPresent(MANIFEST_DIR, { recursive: true });
		await this.#removeIfPresent(ACTIVE_FILE);
		this.#chunkDir = await this.#root.getDirectoryHandle(CHUNK_DIR, {
			create: true,
		});
		this.#manifestDir = await this.#root.getDirectoryHandle(MANIFEST_DIR, {
			create: true,
		});
	}

	/** Remove a root entry, swallowing a NotFoundError (a missing entry is fine). */
	async #removeIfPresent(
		name: string,
		options?: FileSystemRemoveOptions,
	): Promise<void> {
		try {
			await this.#root.removeEntry(name, options);
		} catch (error) {
			if (error instanceof DOMException && error.name === "NotFoundError") {
				return;
			}
			throw error;
		}
	}

	/** Best-effort removal of a bad chunk file; the caller's error still wins. */
	async #evictChunk(chunkHash: string): Promise<void> {
		try {
			await this.#chunkDir.removeEntry(chunkHash);
		} catch {
			// Eviction is advisory: if it fails, the read error propagates anyway.
		}
	}

	private async writeFile(
		dir: FileSystemDirectoryHandle,
		name: string,
		data: Uint8Array,
	): Promise<void> {
		try {
			const fileHandle = await dir.getFileHandle(name, { create: true });
			const handle = await fileHandle.createSyncAccessHandle();
			try {
				writeHandle(handle, data);
			} finally {
				handle.close();
			}
		} catch (error) {
			// getFileHandle(create:true) creates the entry before bytes land; a
			// failed write must not strand a truncated file that would read as
			// present. Remove whatever this write left behind, then re-throw.
			try {
				await dir.removeEntry(name);
			} catch {
				// Best-effort: the original write error is the one that matters.
			}
			// A storage-quota write failure (common on iOS Safari under pressure) is
			// translated to a typed, user-explained QuotaError so the boot banner can
			// say "not enough free storage" instead of surfacing a raw DOMException.
			if (isQuotaExceeded(error)) {
				throw new QuotaError(
					"not enough free storage on this device — free up space or use a desktop browser",
					{ cause: error },
				);
			}
			throw error;
		}
	}

	private async readFile(
		dir: FileSystemDirectoryHandle,
		name: string,
	): Promise<Uint8Array> {
		const fileHandle = await dir.getFileHandle(name);
		const handle = await fileHandle.createSyncAccessHandle();
		try {
			return readHandle(handle);
		} finally {
			handle.close();
		}
	}
}
