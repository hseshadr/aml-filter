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
 *   sync the signed bundle → verify ed25519+sha256 → download + compile the
 *   ~25 MB MiniLM model in the Worker → search the list in-tab as you type.
 *
 * It asserts: the empty box browses the whole list; an exact name and a TYPO
 * both surface a real, explainable, full-dossier match; nonsense returns no
 * match — all with NO in-page errors.
 */

const MODEL_LOAD_TIMEOUT_MS = 160_000;
const RESULT_TIMEOUT_MS = 30_000;

test("searches the sanctions list in-browser over the minified build, with full dossiers", async ({
	page,
}) => {
	test.setTimeout(180_000);

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

	// Bootstrap = sync + verify + ~25 MB model download + compile. The box is
	// disabled until the runtime is "ready"; that it ENABLES proves the model
	// loaded without the production crash.
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
	// the widened dossier: DOB + address surfaced from the bundle
	await expect(scoredCard).toContainText("1971-03-14");
	await expect(scoredCard).toContainText("Invented Prospekt");

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
