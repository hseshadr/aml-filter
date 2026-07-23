/**
 * Same-realm rewrap shim for `crypto.subtle.digest` under vitest's jsdom.
 *
 * Ported verbatim from
 * `packages/amlfilter-browser/src/test/setupSubtleDigestRealm.ts`, which
 * documents the root cause in full: vitest's jsdom environment supplies
 * globals — including `ArrayBuffer` — from a jsdom VM context, while
 * `globalThis.crypto.subtle` stays Node's native WebCrypto. @noble/ed25519
 * hashes via `subtle.digest('SHA-512', m.buffer)` with a bare ArrayBuffer,
 * and Node 22 brand-checks that argument against its OWN ArrayBuffer — a
 * cross-realm one fails with a TypeError. The app suite hits the same wall
 * the moment a component spec exercises the install-key / score-receipt path
 * (DossierCard verifies real Ed25519 receipts).
 *
 * The fix stays at the harness boundary only: rewrap a rejected bare
 * ArrayBuffer in a same-realm-safe `Uint8Array` view over the identical
 * buffer and retry the SAME native digest. A real browser has one realm and
 * never takes this path; any other error propagates unchanged.
 */
const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);

crypto.subtle.digest = (async (
	algorithm: AlgorithmIdentifier,
	data: BufferSource,
): Promise<ArrayBuffer> => {
	try {
		return await nativeDigest(algorithm, data);
	} catch (error) {
		// TypedArrays already pass Node's brand check, so only the
		// bare-ArrayBuffer branch needs rewrapping.
		if (!(error instanceof TypeError) || ArrayBuffer.isView(data)) throw error;
		return nativeDigest(algorithm, new Uint8Array(data));
	}
}) as typeof crypto.subtle.digest;
