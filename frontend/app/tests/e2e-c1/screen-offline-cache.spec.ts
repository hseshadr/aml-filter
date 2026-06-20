import { expect, test } from "@playwright/test";

/**
 * C1 — Theme C: the DURABLE WATCHLIST CACHE + OFFLINE path, proven END-TO-END
 * in a REAL headless Chromium over the MINIFIED production build with the
 * COMMITTED signed catalog + per-list dirs + pinned key.
 *
 * The regression guard for the offline story: the engine fetches the signed
 * catalog + each list's watchlist.json, verifies fail-closed, and now also
 * caches the VERIFIED raw bytes + detached signature into IndexedDB. On a cold
 * start with the network for those artifacts BLOCKED, the cache-aware loaders
 * must re-verify the CACHED bytes (fail-closed, against the pinned key) and boot
 * the engine — no application backend, real IndexedDB, secure-context localhost.
 *
 * Flow:
 *   1. First load (online): boot → cache populates → "Ivan Fakovich" screens.
 *   2. Reload with EVERY watchlist-artifact request ABORTED (offline for the
 *      lists): the engine still boots from the cache and screens "Ivan
 *      Fakovich" — proving the durable cache + the offline path, with no
 *      in-page errors.
 *
 * The MiniLM model path is NOT blocked (Chromium's HTTP cache serves the warm
 * weights across the reload); only the watchlist artifacts are cut off, which
 * is exactly the artifact the durable cache covers.
 */

const MODEL_LOAD_TIMEOUT_MS = 160_000;
const RESULT_TIMEOUT_MS = 30_000;

test("boots offline from the durable list cache and screens the sanctioned name", async ({
	page,
}) => {
	test.setTimeout(180_000);

	const errors: string[] = [];
	page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
	page.on("console", (msg) => {
		if (msg.type() !== "error") {
			return;
		}
		const text = msg.text();
		// The aborted watchlist requests (phase 2) surface as benign
		// "Failed to load resource: net::ERR_FAILED" console errors — that is the
		// offline condition we DELIBERATELY induce, not a regression. The proof the
		// app stayed healthy is that it still boots + screens from the cache below;
		// real in-page errors (uncaught exceptions, verify failures) are still caught.
		if (text.includes("Failed to load resource")) {
			return;
		}
		errors.push(`console.error: ${text}`);
	});

	// --- 1) first load (online): boot fully so the cache is populated ---
	await page.goto("/screen", { waitUntil: "domcontentloaded" });
	const search = page.getByPlaceholder("Search a name, e.g. Ivan Fakovich");
	await expect(search).toBeVisible();
	await expect(search).toBeEnabled({ timeout: MODEL_LOAD_TIMEOUT_MS });

	const alert = page.locator('[role="alert"]');
	if (await alert.count()) {
		throw new Error(`bootstrap errored: ${await alert.first().textContent()}`);
	}

	await expect(
		page.locator(".match-card__name", { hasText: "Ivan Fakovich" }),
	).toBeVisible({ timeout: RESULT_TIMEOUT_MS });

	// --- 2) go OFFLINE for the watchlist artifacts, then reload from cache ---
	// Abort every catalog/manifest/watchlist/.sig request: the durable IndexedDB
	// cache is now the ONLY source for the signed list bytes. The pinned key
	// (public.key) and the model weights stay reachable (HTTP-cached).
	await page.route("**/watchlist/**", (route) => route.abort());

	await page.reload({ waitUntil: "domcontentloaded" });

	const search2 = page.getByPlaceholder("Search a name, e.g. Ivan Fakovich");
	await expect(search2).toBeVisible();
	// It ENABLES only if the cached, RE-VERIFIED list bytes loaded — the offline
	// proof. (If verify failed or the cache were a trust-bypass, this would hang
	// or error instead.)
	await expect(search2).toBeEnabled({ timeout: MODEL_LOAD_TIMEOUT_MS });

	const alert2 = page.locator('[role="alert"]');
	if (await alert2.count()) {
		throw new Error(
			`offline reload errored: ${await alert2.first().textContent()}`,
		);
	}

	// The cached list still screens the known sanctioned entity, fully offline.
	await search2.fill("Ivan Fakovich");
	const scoredCard = page
		.locator(".match-card:has(.match-card__score)")
		.first();
	await expect(scoredCard).toBeVisible({ timeout: RESULT_TIMEOUT_MS });
	await expect(scoredCard.locator(".match-card__name")).toHaveText(
		"Ivan Fakovich",
	);

	expect(errors, `in-browser errors:\n${errors.join("\n")}`).toEqual([]);
});
