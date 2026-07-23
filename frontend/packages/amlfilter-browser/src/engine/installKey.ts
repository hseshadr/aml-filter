// The per-install signing key behind the Avow score receipt.
//
// A receipt is only meaningful if the same installation signs with a STABLE
// key: that is what lets a reviewer pin one public key and later verify every
// receipt this browser profile ever produced. So the seed is generated once, on
// first use, and persisted; every later boot re-derives the same public key.
//
// Key-custody honesty (the same caveat scoreReceipt.ts carries): the seed is
// held in ordinary browser storage. Same-origin script can read it. This is a
// tamper-EVIDENT provenance record, not a hardware-backed key boundary. It
// proves a receipt was not altered after signing; it does not prove the host
// was uncompromised at signing time.

import { generateSeedHex, publicKeyHex } from "@edgeproc/avow";

/** The slice of Web Storage this module needs — injectable so tests can fix a seed. */
export interface KeyStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/** A resolved install identity: the secret seed plus its public verify key. */
export interface InstallKey {
	readonly seedHex: string;
	readonly publicKeyHex: string;
	/**
	 * True when a CORRUPT persisted seed was found, quarantined, and replaced by
	 * a fresh key. Callers can surface this as "trust anchor was reset": every
	 * receipt sealed before the reset now verifies against a key this store no
	 * longer holds. First-use generation is NOT a reset.
	 */
	readonly resetFromCorruptSeed: boolean;
}

/** Storage key for the persisted install seed. Versioned so a format change re-keys. */
export const INSTALL_SEED_KEY = "amlfilter.install_signing_seed.v1";

/**
 * Where a corrupt persisted seed is preserved (as JSON: the value + when).
 * A corrupt entry is EVIDENCE — of a storage fault, another tab's bug, or
 * tampering — so it is moved aside, never silently destroyed.
 */
export const INSTALL_SEED_QUARANTINE_KEY =
	"amlfilter.install_signing_seed.v1.quarantined";

/** An Ed25519 seed is exactly 32 bytes as lowercase hex. */
const SEED_HEX = /^[0-9a-f]{64}$/;

/**
 * Quarantine a malformed persisted seed and emit a structured audit warning.
 * The warning carries metadata only — never the value itself, because a
 * "corrupt seed" can be a secret pasted into the wrong slot.
 */
function quarantineCorruptSeed(storage: KeyStorage, corrupt: string): void {
	storage.setItem(
		INSTALL_SEED_QUARANTINE_KEY,
		JSON.stringify({
			value: corrupt,
			quarantined_at: new Date().toISOString(),
		}),
	);
	console.warn("amlfilter.install_key.corrupt_seed_quarantined", {
		storageKey: INSTALL_SEED_KEY,
		quarantineKey: INSTALL_SEED_QUARANTINE_KEY,
		valueLength: corrupt.length,
	});
}

/**
 * Resolve this installation's signing key, generating + persisting a seed on
 * first use. Idempotent: repeated calls on the same storage return the same key.
 * A corrupted entry re-keys rather than bricking the screening path (a bad seed
 * would fail every signature anyway) — but the corrupt value is quarantined and
 * the returned key signals the reset (`resetFromCorruptSeed`).
 */
export async function loadInstallKey(storage: KeyStorage): Promise<InstallKey> {
	const stored = storage.getItem(INSTALL_SEED_KEY);
	const valid = stored !== null && SEED_HEX.test(stored) ? stored : null;
	const corrupt = stored !== null && valid === null ? stored : null;
	if (corrupt !== null) {
		quarantineCorruptSeed(storage, corrupt);
	}
	const seedHex = valid ?? generateSeedHex();
	if (valid === null) {
		storage.setItem(INSTALL_SEED_KEY, seedHex);
	}
	return {
		seedHex,
		publicKeyHex: await publicKeyHex(seedHex),
		resetFromCorruptSeed: corrupt !== null,
	};
}

/**
 * The default storage: this tab's localStorage, or null where it is unavailable
 * (a Worker, or a browser with storage blocked). Callers treat null as "cannot
 * sign here" rather than crashing the screen.
 */
export function defaultKeyStorage(): KeyStorage | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		// Accessing localStorage throws outright when storage is blocked by policy.
		return null;
	}
}
