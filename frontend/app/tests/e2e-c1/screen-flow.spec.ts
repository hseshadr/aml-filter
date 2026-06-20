import { expect, test } from "@playwright/test";

/**
 * C1 — the headline in-browser SEARCH flow, proven END-TO-END in a REAL
 * headless Chromium over the MINIFIED production build.
 *
 * This is the regression guard for the production-only model-load crash
 * (`Ke(...).call is not a function`, from class private fields downleveled at an
 * es2020 build target). The Node embedder path and the default `screen.spec.ts`
 * both run unminified and so never caught it. This spec exercises the exact path
 * a real visitor hits:
 *
 *   fetch the signed catalog (watchlist/catalog.json, same-origin) →
 *   ed25519-verify fail-closed → load every per-list dir it points at
 *   (watchlist/<id>/…) → decode the precomputed vectors → download + compile
 *   the ~23 MB MiniLM model in the Worker → search the lists in-tab as you type.
 *
 * It is also the embedding-parity end-to-end proof + the real-artifact guard:
 * it drives the COMMITTED signed catalog + per-list dirs against the COMMITTED
 * pinned key and asserts the known demo entity "Ivan Fakovich" (OFAC_SDN:0001)
 * surfaces as a strong, explainable hit. It asserts: the empty box browses the
 * whole list (now the union of all catalog lists); an exact name and a TYPO both
 * surface a real, explainable, scored hit with the watchlist's DOB; nonsense
 * returns no match — all with NO in-page errors.
 */

const MODEL_LOAD_TIMEOUT_MS = 160_000;
const RESULT_TIMEOUT_MS = 30_000;

test("searches the sanctions list in-browser over the minified build, with full dossiers", async ({
	page,
}) => {
	test.setTimeout(240_000);

	const errors: string[] = [];
	page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
	page.on("console", (msg) => {
		if (msg.type() === "error") {
			errors.push(`console.error: ${msg.text()}`);
		}
	});

	await page.goto("/screen", { waitUntil: "domcontentloaded" });

	const search = page.getByPlaceholder("Search a name, e.g. Ivan Fakovich");
	await expect(search).toBeVisible();

	// Bootstrap = fetch watchlist + ed25519-verify + ~23 MB model download +
	// compile. The box is disabled until the runtime is "ready"; that it ENABLES
	// proves the watchlist verified and the model loaded without the prod crash.
	await expect(search).toBeEnabled({ timeout: MODEL_LOAD_TIMEOUT_MS });

	const alert = page.locator('[role="alert"]');
	if (await alert.count()) {
		throw new Error(`bootstrap errored: ${await alert.first().textContent()}`);
	}

	// --- browse: the empty box lists the whole demo list (discoverability) ---
	await expect(
		page.locator(".match-card__name", { hasText: "Ivan Fakovich" }),
	).toBeVisible({ timeout: RESULT_TIMEOUT_MS });

	// A scored search card (browse cards carry no score; search cards do).
	const scoredCard = page
		.locator(".match-card:has(.match-card__score)")
		.first();

	// --- positive: exact sanctioned name → scored, explainable, full dossier ---
	await search.fill("Ivan Fakovich");
	await expect(scoredCard).toBeVisible({ timeout: RESULT_TIMEOUT_MS });
	await expect(scoredCard.locator(".match-card__name")).toHaveText(
		"Ivan Fakovich",
	);
	const scoreText =
		(await scoredCard.locator(".match-card__score").textContent()) ?? "";
	expect(Number.parseFloat(scoreText)).toBeGreaterThan(0);
	await expect(scoredCard.locator(".match-card__why")).not.toBeEmpty();
	expect(
		await scoredCard.locator(".match-card__signal dt").count(),
	).toBeGreaterThan(0);
	// the dossier carries the DOB the v3 watchlist publishes for this entity.
	await expect(scoredCard).toContainText("1971-03-14");

	// --- fuzzy: a TYPO still finds the target (vector + trigram) ---
	await search.fill("");
	await search.fill("fakovic");
	await expect(
		page.locator(".match-card:has(.match-card__score) .match-card__name", {
			hasText: "Ivan Fakovich",
		}),
	).toBeVisible({ timeout: RESULT_TIMEOUT_MS });

	// --- negative: nonsense yields a clean no-match ---
	await search.fill("");
	await search.fill("zxqwqx vbnmlk");
	const clear = page.locator(".screen-results--clear");
	await expect(clear).toBeVisible({ timeout: RESULT_TIMEOUT_MS });
	await expect(clear).toContainText(/no sanctions match/i);
	expect(await page.locator(".match-card").count()).toBe(0);

	expect(errors, `in-browser errors:\n${errors.join("\n")}`).toEqual([]);
});
