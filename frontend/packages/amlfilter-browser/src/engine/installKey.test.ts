// The per-install signing key: generated once, persisted, stable thereafter.
// Stability is the whole point — a reviewer pins ONE public key and must be able
// to verify every receipt this install produced, across reloads.

import { publicKeyHex } from "@edgeproc/avow";
import { describe, expect, it } from "vitest";
import {
	defaultKeyStorage,
	INSTALL_SEED_KEY,
	type KeyStorage,
	loadInstallKey,
} from "./installKey";

/** An in-memory KeyStorage — the injectable seam this module exists to have. */
function memoryStorage(seed?: string): KeyStorage {
	const map = new Map<string, string>();
	if (seed !== undefined) {
		map.set(INSTALL_SEED_KEY, seed);
	}
	return {
		getItem: (k) => map.get(k) ?? null,
		setItem: (k, v) => {
			map.set(k, v);
		},
	};
}

const FIXED_SEED = "11".repeat(32);

describe("loadInstallKey", () => {
	it("generates and PERSISTS a seed on first use", async () => {
		const storage = memoryStorage();
		const key = await loadInstallKey(storage);

		expect(key.seedHex).toMatch(/^[0-9a-f]{64}$/);
		expect(storage.getItem(INSTALL_SEED_KEY)).toBe(key.seedHex);
	});

	it("reuses the persisted seed on every later boot (stable public key)", async () => {
		const storage = memoryStorage();
		const first = await loadInstallKey(storage);
		const second = await loadInstallKey(storage);

		expect(second.seedHex).toBe(first.seedHex);
		expect(second.publicKeyHex).toBe(first.publicKeyHex);
	});

	it("derives the public key the Avow verifier will pin", async () => {
		const key = await loadInstallKey(memoryStorage(FIXED_SEED));

		expect(key.seedHex).toBe(FIXED_SEED);
		expect(key.publicKeyHex).toBe(await publicKeyHex(FIXED_SEED));
	});

	it("RE-KEYS past a corrupted seed rather than bricking screening", async () => {
		const storage = memoryStorage("not-a-valid-hex-seed");
		const key = await loadInstallKey(storage);

		expect(key.seedHex).toMatch(/^[0-9a-f]{64}$/);
		expect(storage.getItem(INSTALL_SEED_KEY)).toBe(key.seedHex);
	});
});

describe("defaultKeyStorage", () => {
	it("resolves this tab's localStorage when storage is available", () => {
		expect(defaultKeyStorage()).toBe(globalThis.localStorage);
	});
});
