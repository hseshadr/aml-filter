import { expect, type Page, test } from "@playwright/test";

/**
 * C1 — the COLD / BLOCKED-CDN boot path, proven END-TO-END in a REAL headless
 * Chromium over the MINIFIED production build. This closes the gap the warm
 * `screen-flow.spec.ts` left open: that spec always loads the model with the
 * weights reachable, so it never exercised a stalled or blocked CDN — the exact
 * shape of the original "OFAC sync forever" boot hang.
 *
 * Three things are proven here:
 *
 *   (a) CDN-blocked, self-host works — with every huggingface.co request aborted,
 *       /screen STILL boots: the model loads from the same-origin /models/ mirror.
 *       This proves the runtime has NO huggingface.co dependency. It doubles as
 *       the `useBrowserCache` re-enable guard: the assertion of ZERO in-page
 *       console errors re-trips if the old es2020 `Ke(...).call is not a function`
 *       downlevel crash ever returns on the minified build.
 *
 *   (b) Everything blocked → loud failure + Retry — with the CDN AND the /models/
 *       mirror both blocked, the boot FAILS LOUDLY: a role="alert" banner with a
 *       working Retry button appears within a bounded time, instead of hanging
 *       forever. This is the direct regression guard for the original boot hang.
 *       The bound is enforced by VITE_MODEL_LOAD_TIMEOUT_MS (set in
 *       playwright.c1.config.ts) so the warmup rejects at the 120s ceiling
 *       instead of hanging forever.
 *
 *   (c) progress percent — SKIPPED. transformers.js only emits a download percent
 *       when the response carries a Content-Length it trusts; for the local
 *       /models/ mirror (and under route interception) the `total` is unreliable,
 *       so a "%-increases" assertion would be flaky. The progress WIRING is
 *       covered deterministically by the runtime unit test
 *       ("threads an embedder progress event into a loading-model stage").
 */

/**
 * Both bounds below are derived from the warmup ceiling the c1 config pins via
 * `VITE_MODEL_LOAD_TIMEOUT_MS=120000` (see playwright.c1.config.ts). Keeping them
 * tethered to that one number means a model-load regression fails within the
 * ceiling and the two values can't silently drift from the config. (120s is the
 * production ceiling — chosen so the WARM specs survive a slow CI cold compile;
 * the blocked path here still rejects loudly, just bounded by 120s.)
 */
const MODEL_LOAD_TIMEOUT_MS = 120_000;

/**
 * Scenario (a) ready bound: the warmup is capped at MODEL_LOAD_TIMEOUT_MS, so a
 * healthy self-host load must enable the box within that ceiling plus modest
 * sync/headroom (135s = 120s + 15s). A self-host load that can't finish inside
 * the production ceiling is a regression.
 */
const READY_TIMEOUT_MS = MODEL_LOAD_TIMEOUT_MS + 15_000;

/**
 * Scenario (b) failure bound: with all weight sources blocked the warmup must
 * REJECT at the same MODEL_LOAD_TIMEOUT_MS ceiling (135s with headroom). This
 * proves "fails loudly within the bound", not merely "doesn't hang forever", and
 * tracks the config value if it changes.
 */
const FAILURE_TIMEOUT_MS = MODEL_LOAD_TIMEOUT_MS + 15_000;

const RESULT_TIMEOUT_MS = 30_000;

const SEARCH_PLACEHOLDER = "Search a name, e.g. Ivan Fakovich";

/** Hosts transformers.js could reach for weights — the HF hub and its LFS CDN. */
const HF_GLOBS = ["**huggingface.co/**", "**cdn-lfs**", "**hf.co/**"];

/** Collect in-page errors (pageerror + console.error) for a clean-console assert. */
function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
	page.on("console", (msg) => {
		if (msg.type() === "error") {
			errors.push(`console.error: ${msg.text()}`);
		}
	});
	return errors;
}

test("self-host serves the model when the HF CDN is blocked — no huggingface.co dependency", async ({
	page,
}) => {
	test.setTimeout(240_000);
	const errors = collectErrors(page);

	// Abort every request to the HF hub / its LFS CDN, and record that the runtime
	// never even tried to reach it (the self-host path must be the only one used).
	let hitHf = 0;
	for (const glob of HF_GLOBS) {
		await page.route(glob, (route) => {
			hitHf += 1;
			return route.abort();
		});
	}

	await page.goto("/screen", { waitUntil: "domcontentloaded" });

	const search = page.getByPlaceholder(SEARCH_PLACEHOLDER);
	await expect(search).toBeVisible();

	// The box ENABLES only once bootstrap reaches "ready" — i.e. the ~23 MB model
	// loaded. With the CDN blocked, that can only have come from /models/.
	await expect(search).toBeEnabled({ timeout: READY_TIMEOUT_MS });

	// No error banner: the blocked CDN did not break the boot.
	await expect(page.locator('[role="alert"]')).toHaveCount(0);

	// The empty box browses the whole demo list — proves the engine is live.
	await expect(
		page.locator(".match-card__name", { hasText: "Ivan Fakovich" }),
	).toBeVisible({ timeout: RESULT_TIMEOUT_MS });

	// The runtime never depended on huggingface.co: nothing reached the blocked
	// hosts, and the minified model-load path threw no console errors (the
	// useBrowserCache re-enable guard — a return of the es2020 crash trips this).
	expect(hitHf, "the runtime hit a blocked HF host").toBe(0);
	expect(errors, `in-browser errors:\n${errors.join("\n")}`).toEqual([]);

	// useBrowserCache is ON: a successful load must have populated the CacheStorage
	// cache transformers.js uses (`transformers-cache`). Asserting it was written —
	// not merely that nothing crashed — proves the re-enabled cache path actually
	// ran on the minified build, so a returning visitor reuses these weights.
	const cachedModelFiles = await page.evaluate(async () => {
		const cache = await caches.open("transformers-cache");
		const keys = await cache.keys();
		return keys
			.map((req) => req.url)
			.filter((url) => url.includes("all-MiniLM-L6-v2")).length;
	});
	expect(
		cachedModelFiles,
		"transformers-cache was not populated",
	).toBeGreaterThan(0);

	// Warm-cache HIT: reload the SAME page (HF routes are still aborted, /models/
	// still reachable, but the weights are now in transformers-cache). The box must
	// re-enable and the console must stay error-free — proving the warm-cache code
	// path also stays crash-free on the minified build, not just the cold load.
	await page.reload({ waitUntil: "domcontentloaded" });
	const warmSearch = page.getByPlaceholder(SEARCH_PLACEHOLDER);
	await expect(warmSearch).toBeEnabled({ timeout: READY_TIMEOUT_MS });
	await expect(page.locator('[role="alert"]')).toHaveCount(0);
	expect(
		errors,
		`in-browser errors after warm-cache reload:\n${errors.join("\n")}`,
	).toEqual([]);
});

test("everything blocked → the boot fails loudly with a working Retry, not a silent hang", async ({
	page,
}) => {
	test.setTimeout(240_000);
	collectErrors(page);

	// Block BOTH the CDN and the same-origin /models/ mirror: the model can load
	// from nowhere, so the warmup must reject (bounded by VITE_MODEL_LOAD_TIMEOUT_MS).
	for (const glob of [...HF_GLOBS, "**/models/**"]) {
		await page.route(glob, (route) => route.abort());
	}

	await page.goto("/screen", { waitUntil: "domcontentloaded" });

	await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible();

	// The regression guard: instead of hanging forever, a role="alert" banner with
	// a Retry button appears within a bounded time.
	const alert = page.locator('[role="alert"]');
	await expect(alert).toBeVisible({ timeout: FAILURE_TIMEOUT_MS });
	await expect(alert).toContainText(/could not load the screening bundle/i);

	const retry = alert.getByRole("button", { name: "Retry" });
	await expect(retry).toBeVisible();
	await expect(retry).toBeEnabled();

	// Retry actually re-fires the boot: clicking it returns the page to the
	// "booting" status banner (the boot is re-attempted, not stuck on the error).
	await retry.click();
	await expect(page.locator('[role="status"]')).toBeVisible({
		timeout: RESULT_TIMEOUT_MS,
	});
});
