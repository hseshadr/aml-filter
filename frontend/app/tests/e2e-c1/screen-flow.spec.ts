import { expect, test } from "@playwright/test";

/**
 * C1 — the headline in-browser screening flow, proven END-TO-END in a REAL
 * headless Chromium over the MINIFIED production build.
 *
 * This is the regression guard for the production-only model-load crash
 * (`Ke(...).call is not a function`, from class private fields downleveled to a
 * WeakMap accessor at the es2020 build target). The Node embedder test and the
 * default `screen.spec.ts` both run unminified (Node / `vite dev`) and so never
 * caught it. This spec exercises the exact path a real visitor hits:
 *
 *   sync the signed bundle → verify ed25519+sha256 → download + compile the
 *   ~25 MB MiniLM model in the Worker → screen a name in-tab.
 *
 * It asserts a real, explainable match for a sanctioned demo entity and an
 * empty result for a nonsense name — with NO in-page errors.
 */

const MODEL_LOAD_TIMEOUT_MS = 160_000;

test("screens a sanctioned name to a real explainable match, in-browser, over the minified build", async ({
	page,
}) => {
	test.setTimeout(180_000);

	// Surface any in-browser failure (the model-load crash showed up here).
	const errors: string[] = [];
	page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
	page.on("console", (msg) => {
		if (msg.type() === "error") {
			errors.push(`console.error: ${msg.text()}`);
		}
	});

	await page.goto("/screen", { waitUntil: "domcontentloaded" });

	const input = page.getByPlaceholder("e.g. Vladimir Ivanov");
	await expect(input).toBeVisible();

	// Bootstrap = sync + verify + ~25 MB model download + compile. The input is
	// disabled until the runtime reaches the "ready" phase; that it ENABLES is
	// the proof the model loaded without the production crash.
	await expect(input).toBeEnabled({ timeout: MODEL_LOAD_TIMEOUT_MS });

	// If bootstrap failed, the page renders a role=alert banner — fail loudly
	// with its message rather than on a downstream selector.
	const alert = page.locator('[role="alert"]');
	if (await alert.count()) {
		throw new Error(`bootstrap errored: ${await alert.first().textContent()}`);
	}

	// --- positive: a sanctioned demo entity (DEMO_SDN:0001) ---
	await input.fill("Ivan Fakovich");
	await page.getByRole("button", { name: /Screen/ }).click();

	const card = page.locator(".match-card").first();
	await expect(card).toBeVisible({ timeout: 30_000 });
	await expect(card.locator(".match-card__name")).toHaveText("Ivan Fakovich");

	// a real numeric score
	const scoreText =
		(await card.locator(".match-card__score").textContent()) ?? "";
	expect(scoreText).toMatch(/[0-9]/);
	expect(Number.parseFloat(scoreText)).toBeGreaterThan(0);

	// a real explanation + at least one named signal (explainability)
	await expect(card.locator(".match-card__why")).not.toBeEmpty();
	expect(await card.locator(".match-card__signal dt").count()).toBeGreaterThan(
		0,
	);

	// --- negative: a nonsense name yields NO match ---
	await input.fill("");
	await input.fill("Zxqw Nonexistent");
	await page.getByRole("button", { name: /Screen/ }).click();

	const clear = page.locator(".screen-results--clear");
	await expect(clear).toBeVisible({ timeout: 30_000 });
	await expect(clear).toContainText(/no sanctions match/i);
	expect(await page.locator(".match-card").count()).toBe(0);

	// the whole flow ran with no in-browser errors
	expect(errors, `in-browser errors:\n${errors.join("\n")}`).toEqual([]);
});
