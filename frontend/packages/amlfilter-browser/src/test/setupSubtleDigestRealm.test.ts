// Direct regression test for the setupSubtleDigestRealm shim (see that
// file's header for the full root-cause writeup). Reproduces the realm split
// with a genuinely different-realm ArrayBuffer via node:vm, independent of
// any product code or third-party package, so this stays red/green on the
// shim alone rather than on @noble/ed25519's internals.
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

describe("crypto.subtle.digest cross-realm ArrayBuffer", () => {
	it("hashes a bare ArrayBuffer built in a different JS realm", async () => {
		const crossRealmBuffer = runInNewContext(
			"new Uint8Array([1, 2, 3, 4]).buffer",
		) as ArrayBuffer;

		// Sanity: this really is a different realm's ArrayBuffer, not this
		// file's own — jsdom's realm split means a same-realm buffer would
		// pass Node's brand check even without the bug this test exists to
		// catch, silently making the test worthless.
		expect(crossRealmBuffer).not.toBeInstanceOf(ArrayBuffer);

		const digest = await crypto.subtle.digest("SHA-256", crossRealmBuffer);

		expect(digest.byteLength).toBe(32);
	});
});
