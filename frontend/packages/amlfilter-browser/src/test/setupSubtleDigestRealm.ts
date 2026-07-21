/**
 * WHY THIS SHIM EXISTS
 *
 * scoreReceipt.test.ts (a8657e2) documented the root cause in full: vitest's
 * jsdom environment supplies globals — including `ArrayBuffer` — from a jsdom
 * VM context, while `globalThis.crypto.subtle` stays Node's native WebCrypto.
 * @noble/ed25519 hashes via `subtle.digest('SHA-512', m.buffer)`, passing a
 * bare ArrayBuffer, and Node 22's WebCrypto brand-checks that argument against
 * its OWN native ArrayBuffer constructor — a cross-realm one fails with:
 *
 *   TypeError: Failed to execute 'digest' on 'SubtleCrypto': 2nd argument is
 *   not instance of ArrayBuffer, Buffer, TypedArray, or DataView.
 *
 * That commit fixed it for one file by opting out of jsdom entirely via
 * `@vitest-environment node`. Wiring signMatchReceipt into the live screening
 * path (matchReceipts.ts, installKey.ts) means every suite that boots the
 * engine now derives an Ed25519 key too — including suites that also need
 * jsdom's IndexedDB/Worker globals in the SAME file (bundleSource.test.ts,
 * multiEngine.test.ts, runtime.test.ts) and so cannot opt out per-file.
 *
 * THE FIX, AT THE HARNESS BOUNDARY ONLY. a8657e2's own probe measured that
 * cross-realm *TypedArrays* pass Node's brand check; only a bare ArrayBuffer
 * trips it. So this shim does not touch product code or copy/alter any
 * bytes — it only rewraps a rejected bare ArrayBuffer in a same-realm-safe
 * `Uint8Array` view (over the identical buffer) before retrying the SAME
 * native digest. A real browser has one realm and never needs this path; the
 * shim only engages on the exact TypeError the realm split produces, and any
 * other error propagates unchanged.
 */
const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);

crypto.subtle.digest = (async (
	algorithm: AlgorithmIdentifier,
	data: BufferSource,
): Promise<ArrayBuffer> => {
	try {
		return await nativeDigest(algorithm, data);
	} catch (error) {
		// Narrows `data` to `ArrayBuffer` for the retry below: BufferSource is
		// `ArrayBuffer | ArrayBufferView`, and TypedArrays already pass Node's
		// brand check, so only the bare-ArrayBuffer branch needs rewrapping.
		if (!(error instanceof TypeError) || ArrayBuffer.isView(data)) throw error;
		return nativeDigest(algorithm, new Uint8Array(data));
	}
}) as typeof crypto.subtle.digest;
