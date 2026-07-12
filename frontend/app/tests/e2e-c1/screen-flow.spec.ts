import { expect, test } from "@playwright/test";

/**
 * C1 — the headline in-browser SEARCH flow, proven END-TO-END in a REAL
 * headless Chromium over the MINIFIED production build.
 *
 * This is the regression guard for the production-only model-load crash
 * (`Ke(...).call is not a function`, from class private fields downleveled at an
 * es2020 build target). The Node embedder path and the default `screen.spec.ts`
 * both run unminified and so never caught it. This spec exercises the exact path
 * a real visitor hits — now the SIGNED-BUNDLE boot (no JSON catalog; the c1 build
 * sets no VITE_BUNDLE_BASE_URL, so the runtime defaults to /bundle/origin):
 *
 *   fetch + verify the signed /bundle/origin/latest pointer (cache:no-store) →
 *   content-verify the manifest + every chunk against the pinned same-origin
 *   public.key (fail-closed) → materialize catalog.json + per-list
 *   {entities.jsonl,vectors.f32,meta.json} into OPFS → download + compile
 *   the ~23 MB MiniLM model in the Worker → search the lists in-tab as you type.
 *
 * It is also the embedding-parity end-to-end proof + the real-artifact guard:
 * it drives the COMMITTED signed bundle (app/public/bundle/origin) against the
 * COMMITTED pinned key and asserts the known demo entity "Ivan Fakovich"
 * (OFAC_SDN:0001) surfaces as a strong, explainable hit. It asserts: the empty
 * box browses the whole list (now the union of all bundle lists); an exact name
 * and a TYPO both surface a real, explainable, scored hit with the watchlist's
 * DOB; nonsense returns no match — all with NO in-page errors.
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
	let modelRequests = 0;
	page.on("request", (request) => {
		if (request.url().endsWith("/onnx/model_quantized.onnx")) {
			modelRequests += 1;
		}
	});

	await page.goto("/screen", { waitUntil: "domcontentloaded" });

	const search = page.getByPlaceholder("Search a name, e.g. Ivan Fakovich");
	await expect(search).toBeVisible();

	const alert = page.locator('[role="alert"]');
	// Bootstrap = sync + verify the signed bundle + ~23 MB model download +
	// compile. Race readiness against the error banner so a real boot failure is
	// reported immediately instead of looking like a 160-second disabled-input hang.
	const outcome = await Promise.race([
		expect(search)
			.toBeEnabled({ timeout: MODEL_LOAD_TIMEOUT_MS })
			.then(() => ({ kind: "ready" as const })),
		alert
			.waitFor({ state: "visible", timeout: MODEL_LOAD_TIMEOUT_MS })
			.then(async () => ({
				kind: "error" as const,
				message: await alert.first().textContent(),
			})),
	]);
	if (outcome.kind === "error") {
		throw new Error(`bootstrap errored: ${outcome.message}`);
	}
	expect(modelRequests, "the model must be fetched exactly once").toBe(1);

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
