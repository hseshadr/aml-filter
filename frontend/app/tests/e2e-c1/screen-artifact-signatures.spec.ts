import { expect, test } from "@playwright/test";

/**
 * C1 — in-tab PER-ARTIFACT signature guard over the REAL committed artifacts.
 *
 * The Node-side `demoArtifacts.test.ts` already verifies each committed `.sig`
 * against `public.key`, but the browser C1 lane only proved the catalog verifies
 * end-to-end by booting the engine — it never asserted each per-list `.sig`
 * individually IN-TAB. This spec closes that gap: in the page's real secure
 * context it fetches `public.key`, the signed `catalog.json`, and every per-list
 * `watchlist.json` + `watchlist.manifest.json` the catalog points at, and verifies
 * each detached `.sig` with the SAME WebCrypto Ed25519 path the app's
 * `verifyEd25519` takes on localhost — a regression guard that fires if any
 * committed bundle/key/signature drifts. It also asserts a flipped byte fails
 * closed, mirroring the Node test's tamper check.
 *
 * Runs against the minified production build (the c1 webServer is
 * `vite build && vite preview`), so the artifacts under test are exactly the
 * committed ones served same-origin from /watchlist/.
 */

interface VerifyReport {
	readonly checked: readonly string[];
	readonly tamperRejected: boolean;
}

test("each committed catalog + per-list artifact verifies in-tab against public.key", async ({
	page,
}) => {
	test.setTimeout(60_000);
	await page.goto("/screen", { waitUntil: "domcontentloaded" });

	const report = await page.evaluate<VerifyReport>(async () => {
		const base = document.baseURI;

		async function rawBytes(path: string): Promise<Uint8Array> {
			const res = await fetch(new URL(path, base).toString(), {
				cache: "no-store",
			});
			if (!res.ok) {
				throw new Error(`fetch ${path} -> ${res.status}`);
			}
			return new Uint8Array(await res.arrayBuffer());
		}

		async function sigBytes(path: string): Promise<Uint8Array> {
			const res = await fetch(new URL(path, base).toString(), {
				cache: "no-store",
			});
			if (!res.ok) {
				throw new Error(`fetch ${path} -> ${res.status}`);
			}
			const b64 = (await res.text()).trim();
			const bin = atob(b64);
			const out = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i += 1) {
				out[i] = bin.charCodeAt(i);
			}
			return out;
		}

		const pubRaw = await rawBytes("public.key");
		const key = await crypto.subtle.importKey(
			"raw",
			pubRaw,
			{ name: "Ed25519" },
			false,
			["verify"],
		);

		async function verify(
			message: Uint8Array,
			sig: Uint8Array,
		): Promise<boolean> {
			return crypto.subtle.verify("Ed25519", key, sig, message);
		}

		const checked: string[] = [];
		async function verifyPair(jsonPath: string): Promise<void> {
			const bytes = await rawBytes(jsonPath);
			const sig = await sigBytes(`${jsonPath}.sig`);
			if (!(await verify(bytes, sig))) {
				throw new Error(`signature did not verify: ${jsonPath}`);
			}
			checked.push(jsonPath);
		}

		// 1. The catalog (the trust anchor) verifies, then drives the per-list paths.
		await verifyPair("watchlist/catalog.json");
		const catalog = JSON.parse(
			new TextDecoder().decode(await rawBytes("watchlist/catalog.json")),
		) as { lists: ReadonlyArray<{ path: string }> };

		// 2. Every per-list watchlist.json + manifest the catalog points at.
		for (const list of catalog.lists) {
			await verifyPair(`watchlist/${list.path}watchlist.json`);
			await verifyPair(`watchlist/${list.path}watchlist.manifest.json`);
		}

		// 3. Tamper check: a flipped catalog byte must fail closed.
		const catBytes = await rawBytes("watchlist/catalog.json");
		const catSig = await sigBytes("watchlist/catalog.json.sig");
		const tampered = Uint8Array.from(catBytes);
		tampered[0] = (tampered[0] ?? 0) ^ 0xff;
		const tamperRejected = !(await verify(tampered, catSig));

		return { checked, tamperRejected };
	});

	// At least the catalog + each list's 2 artifacts were verified in-tab.
	expect(report.checked).toContain("watchlist/catalog.json");
	expect(report.checked.length).toBeGreaterThanOrEqual(3);
	expect(
		report.checked.filter((p) => p.endsWith("/watchlist.json")).length,
	).toBeGreaterThan(0);
	expect(
		report.checked.filter((p) => p.endsWith("/watchlist.manifest.json")).length,
	).toBeGreaterThan(0);
	expect(report.tamperRejected).toBe(true);
});
