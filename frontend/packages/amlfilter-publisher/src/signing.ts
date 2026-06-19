// Detached Ed25519 signing over exact file bytes, plus the write-signed pair.
//
// @noble/ed25519 v3 signAsync/getPublicKeyAsync use WebCrypto's async SHA-512 in
// Node 22, so no explicit `ed.hashes.sha512` hook is needed. Signatures produced
// here are accepted by the browser tier's verifyEd25519 (same curve, same raw
// 32-byte public key pinned from public.key) — proven by the round-trip test.

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getPublicKeyAsync, signAsync } from "@noble/ed25519";

/** Sign `message` with a raw 32-byte private key; return the base64 signature. */
export async function signBytes(
	privateKey: Uint8Array,
	message: Uint8Array,
): Promise<string> {
	if (privateKey.length !== 32) {
		throw new Error(
			`private key must be 32 raw bytes, got ${privateKey.length}`,
		);
	}
	const sig = await signAsync(message, privateKey);
	return Buffer.from(sig).toString("base64");
}

/** Derive the raw 32-byte public key from a raw 32-byte private seed. */
export async function derivePublicKey(
	privateKey: Uint8Array,
): Promise<Uint8Array> {
	return getPublicKeyAsync(privateKey);
}

/** Write `bytes` to `<dir>/<name>` and a detached `<dir>/<name>.sig` next to it. */
export async function writeSigned(
	dir: string,
	name: string,
	bytes: Uint8Array,
	privateKey: Uint8Array,
): Promise<void> {
	const sig = await signBytes(privateKey, bytes);
	await writeFile(join(dir, name), bytes);
	await writeFile(join(dir, `${name}.sig`), sig);
}
