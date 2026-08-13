// Select the first durable browser store that actually opens. Capability
// detection alone is insufficient: some WebKit builds expose OPFS but throw on
// getDirectory() at runtime. Keep OPFS preferred and fail over once to the same
// content-addressed CacheStore contract backed by IndexedDB.

import { IndexedDbCacheStore } from "./indexedDbStore";
import { OpfsCacheStore } from "./opfsStore";
import type { CacheStore } from "./types";

export interface DurableStoreOpeners {
	readonly openOpfs: () => Promise<CacheStore>;
	readonly openFallback: () => Promise<CacheStore>;
}

export interface PersistenceStorage {
	readonly persist?: () => Promise<boolean>;
}

const DEFAULT_OPENERS: DurableStoreOpeners = {
	openOpfs: () => OpfsCacheStore.open(),
	openFallback: () => IndexedDbCacheStore.open(),
};

export async function openDurableCacheStore(
	openers: DurableStoreOpeners = DEFAULT_OPENERS,
): Promise<CacheStore> {
	try {
		return await openers.openOpfs();
	} catch (opfsError) {
		try {
			return await openers.openFallback();
		} catch {
			throw opfsError;
		}
	}
}

/** Ask for persistence only when this browser Worker exposes the API. */
export function requestPersistentStorage(
	storage: PersistenceStorage | undefined,
): void {
	void storage?.persist?.().catch(() => false);
}
