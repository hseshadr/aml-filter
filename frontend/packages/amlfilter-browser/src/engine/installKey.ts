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
}

/** Storage key for the persisted install seed. Versioned so a format change re-keys. */
export const INSTALL_SEED_KEY = "amlfilter.install_signing_seed.v1";

/** An Ed25519 seed is exactly 32 bytes as lowercase hex. */
const SEED_HEX = /^[0-9a-f]{64}$/;

/**
 * Read a persisted seed, or null when absent OR malformed. A corrupted entry is
 * treated as absent rather than thrown: a bad seed would fail every signature
 * anyway, so re-keying is strictly better than bricking the screening path.
 */
function readSeed(storage: KeyStorage): string | null {
	const stored = storage.getItem(INSTALL_SEED_KEY);
	return stored !== null && SEED_HEX.test(stored) ? stored : null;
}

/**
 * Resolve this installation's signing key, generating + persisting a seed on
 * first use. Idempotent: repeated calls on the same storage return the same key.
 */
export async function loadInstallKey(storage: KeyStorage): Promise<InstallKey> {
	const existing = readSeed(storage);
	const seedHex = existing ?? generateSeedHex();
	if (existing === null) {
		storage.setItem(INSTALL_SEED_KEY, seedHex);
	}
	return { seedHex, publicKeyHex: await publicKeyHex(seedHex) };
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
