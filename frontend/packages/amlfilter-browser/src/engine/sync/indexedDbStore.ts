// IndexedDB-backed durable CacheStore for WebKit builds where OPFS is exposed
// but cannot actually be opened. OPFS remains the preferred adapter. This
// fallback stores only bounded, compressed signed-bundle chunks and reuses the
// exact same verification and anti-rollback state machine as the OPFS adapter.

import { sha256Hex } from "../crypto";
import { decompressAndVerify, IntegrityError } from "./integrity";
import { isQuotaExceeded, QuotaError } from "./storage";
import type { CacheStore, VersionPointer } from "./types";

const DATABASE_NAME = "aml-filter-signed-bundles-v1";
const DATABASE_VERSION = 1;
const ENTRY_STORE = "entries";
const ACTIVE_KEY = "active";
const DECODER = new TextDecoder();
const ENCODER = new TextEncoder();

export class IndexedDbCacheStore implements CacheStore {
	readonly #database: IDBDatabase;

	private constructor(database: IDBDatabase) {
		this.#database = database;
	}

	public static open(
		factory: IDBFactory = indexedDB,
		databaseName: string = DATABASE_NAME,
	): Promise<IndexedDbCacheStore> {
		return new Promise((resolve, reject) => {
			const request = factory.open(databaseName, DATABASE_VERSION);
			request.onupgradeneeded = () => {
				if (!request.result.objectStoreNames.contains(ENTRY_STORE)) {
					request.result.createObjectStore(ENTRY_STORE);
				}
			};
			request.onsuccess = () =>
				resolve(new IndexedDbCacheStore(request.result));
			request.onerror = () => reject(request.error);
		});
	}

	public close(): void {
		this.#database.close();
	}

	public async hasChunk(chunkHash: string): Promise<boolean> {
		return (await this.#count(this.#chunkKey(chunkHash))) > 0;
	}

	public async putChunkCompressed(
		chunkHash: string,
		compressed: Uint8Array,
	): Promise<void> {
		await decompressAndVerify(chunkHash, compressed);
		await this.#put(this.#chunkKey(chunkHash), compressed);
	}

	public async getChunk(chunkHash: string): Promise<Uint8Array> {
		const key = this.#chunkKey(chunkHash);
		const compressed = await this.#required(key);
		try {
			return await decompressAndVerify(chunkHash, compressed);
		} catch (error) {
			if (error instanceof IntegrityError) {
				await this.#delete(key).catch(() => undefined);
			}
			throw error;
		}
	}

	public async putManifest(manifestBytes: Uint8Array): Promise<string> {
		const manifestHash = await sha256Hex(manifestBytes);
		await this.#put(this.#manifestKey(manifestHash), manifestBytes);
		return manifestHash;
	}

	public async getManifest(manifestHash: string): Promise<Uint8Array> {
		const raw = await this.#required(this.#manifestKey(manifestHash));
		if ((await sha256Hex(raw)) !== manifestHash) {
			throw new IntegrityError(
				`manifest ${manifestHash} failed content-address check`,
			);
		}
		return raw;
	}

	public async readActive(): Promise<VersionPointer | null> {
		try {
			const raw = await this.#required(ACTIVE_KEY);
			return JSON.parse(DECODER.decode(raw)) as VersionPointer;
		} catch {
			return null;
		}
	}

	public async promote(pointer: VersionPointer): Promise<void> {
		await this.#put(ACTIVE_KEY, ENCODER.encode(JSON.stringify(pointer)));
	}

	public async clear(): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			const transaction = this.#database.transaction(ENTRY_STORE, "readwrite");
			transaction.objectStore(ENTRY_STORE).clear();
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () => reject(transaction.error);
		});
	}

	#chunkKey(hash: string): string {
		return `chunk/${hash}`;
	}

	#manifestKey(hash: string): string {
		return `manifest/${hash}`;
	}

	#count(key: string): Promise<number> {
		return new Promise((resolve, reject) => {
			const transaction = this.#database.transaction(ENTRY_STORE, "readonly");
			const request = transaction.objectStore(ENTRY_STORE).count(key);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	async #required(key: string): Promise<Uint8Array> {
		const value = await this.#get(key);
		if (value === undefined) {
			throw new Error(`cached bundle entry is missing: ${key}`);
		}
		return value;
	}

	#get(key: string): Promise<Uint8Array | undefined> {
		return new Promise((resolve, reject) => {
			const transaction = this.#database.transaction(ENTRY_STORE, "readonly");
			const request = transaction.objectStore(ENTRY_STORE).get(key);
			request.onsuccess = () => {
				const value = request.result as ArrayBuffer | undefined;
				resolve(value === undefined ? undefined : new Uint8Array(value));
			};
			request.onerror = () => reject(request.error);
		});
	}

	#put(key: string, data: Uint8Array): Promise<void> {
		return new Promise((resolve, reject) => {
			const transaction = this.#database.transaction(ENTRY_STORE, "readwrite");
			transaction
				.objectStore(ENTRY_STORE)
				.put(new Uint8Array(data).buffer, key);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(this.#writeError(transaction.error));
			transaction.onabort = () => reject(this.#writeError(transaction.error));
		});
	}

	#delete(key: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const transaction = this.#database.transaction(ENTRY_STORE, "readwrite");
			transaction.objectStore(ENTRY_STORE).delete(key);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () => reject(transaction.error);
		});
	}

	#writeError(error: DOMException | null): unknown {
		if (isQuotaExceeded(error)) {
			return new QuotaError(
				"not enough free storage on this device — free up space or use a desktop browser",
				{ cause: error },
			);
		}
		return error ?? new Error("browser storage transaction failed");
	}
}
