// The per-install signing key: generated once, persisted, stable thereafter.
// Stability is the whole point — a reviewer pins ONE public key and must be able
// to verify every receipt this install produced, across reloads.

import { publicKeyHex } from "@edgeproc/avow";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	defaultKeyStorage,
	INSTALL_SEED_KEY,
	INSTALL_SEED_QUARANTINE_KEY,
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

// A corrupt seed is EVIDENCE — of a storage fault, another tab's bug, or
// tampering. Silently overwriting it destroys that evidence and hides the fact
// that every receipt sealed before the reset now verifies against a key the
// store no longer holds. So the corrupt value is quarantined (preserved under a
// separate storage key), a structured warning is emitted, and the resolved key
// carries a signal callers can surface as "trust anchor was reset".
describe("loadInstallKey corrupt-seed quarantine", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("QUARANTINES the corrupt value, warns structuredly, and signals the reset", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const storage = memoryStorage("not-a-valid-hex-seed");

		const key = await loadInstallKey(storage);

		// Re-keyed…
		expect(key.seedHex).toMatch(/^[0-9a-f]{64}$/);
		// …the corrupt value is preserved, not destroyed…
		expect(storage.getItem(INSTALL_SEED_QUARANTINE_KEY)).toContain(
			"not-a-valid-hex-seed",
		);
		// …the reset is machine-detectable by callers…
		expect(key.resetFromCorruptSeed).toBe(true);
		// …and a structured audit line names the event (never the value itself —
		// a "corrupt seed" can be a secret pasted into the wrong slot).
		expect(warn).toHaveBeenCalledWith(
			"amlfilter.install_key.corrupt_seed_quarantined",
			expect.objectContaining({
				quarantineKey: INSTALL_SEED_QUARANTINE_KEY,
			}),
		);
		expect(JSON.stringify(warn.mock.calls)).not.toContain(
			"not-a-valid-hex-seed",
		);
	});

	it("does NOT signal a reset on first use (no seed is not a corrupt seed)", async () => {
		const storage = memoryStorage();
		const key = await loadInstallKey(storage);

		expect(key.resetFromCorruptSeed).toBe(false);
		expect(storage.getItem(INSTALL_SEED_QUARANTINE_KEY)).toBeNull();
	});

	it("does NOT signal a reset for a valid persisted seed", async () => {
		const key = await loadInstallKey(memoryStorage(FIXED_SEED));

		expect(key.resetFromCorruptSeed).toBe(false);
	});
});

describe("defaultKeyStorage", () => {
	it("resolves this tab's localStorage when storage is available", () => {
		expect(defaultKeyStorage()).toBe(globalThis.localStorage);
	});
});
