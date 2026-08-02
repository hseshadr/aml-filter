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
 *   (a) CDN-blocked, self-host works — with every huggingface.co request AND
 *       jsDelivr aborted, /screen STILL boots: the model loads from the
 *       same-origin /models/ mirror and the ORT wasm LOADER from the same-origin
 *       staged /ort/ copy (house standard §8.1b — onnxruntime-web's default base
 *       for its dynamically imported loader module is the jsDelivr CDN, a
 *       dependency the old HF-only blocks never exercised: with jsDelivr aborted
 *       the boot silently never reached ready). This proves the runtime has ZERO
 *       CDN dependency. The same test also asserts ZERO font-CDN requests: the
 *       marketing fonts are now local-or-system (index.html links no web-font
 *       CDN), so no route — not even /screen — reaches fonts.googleapis.com. It
 *       doubles as the `useBrowserCache` re-enable guard: the assertion of ZERO
 *       in-page console errors re-trips if the old es2020 `Ke(...).call is not a
 *       function` downlevel crash ever returns on the minified build.
 *
 *   (b) Everything blocked → loud failure + Retry — with the CDN AND the /models/
 *       mirror both blocked, the boot FAILS LOUDLY: a role="alert" banner with a
 *       working Retry button appears within a bounded time, instead of hanging
 *       forever. This is the direct regression guard for the original boot hang.
 *       The bound is enforced by VITE_MODEL_LOAD_IDLE_TIMEOUT_MS (set in
 *       playwright.c1.config.ts). It is a SILENCE bound, not a wall clock: with
 *       every weight source blocked nothing ever reports progress, so the window
 *       expires once and the boot rejects instead of hanging forever.
 *
 *   (c) progress percent — intentionally absent. transformers.js 4.2.0's progress
 *       callback duplicates the ONNX request and can fail Chromium's HTTP cache.
 *       Production keeps the honest indeterminate loading state instead.
 */

/**
 * Both bounds below are derived from the warmup window the c1 config pins via
 * `VITE_MODEL_LOAD_IDLE_TIMEOUT_MS=120000` (see playwright.c1.config.ts).
 * Keeping them tethered to that one number means a model-load regression fails
 * within the window and the two values can't silently drift from the config.
 *
 * NOTE the semantics changed in 2026-08: this is the longest the warmup may stay
 * SILENT, not the longest it may take. Production uses 90s. That is why scenario
 * (a) below is no longer really a ceiling on a healthy load — a healthy load
 * that keeps reporting progress is allowed to run as long as it needs, which is
 * the entire point of the change. The generous value here still serves as a
 * "something is badly wrong" backstop for CI.
 */
const MODEL_LOAD_IDLE_TIMEOUT_MS = 120_000;

/**
 * Scenario (a) ready bound: a healthy self-host load on CI hardware should
 * comfortably enable the box inside one idle window plus sync headroom. This is
 * a test-harness patience limit, NOT a claim that the app kills a slower load —
 * it does not, by design.
 */
const READY_TIMEOUT_MS = MODEL_LOAD_IDLE_TIMEOUT_MS + 15_000;

/**
 * Scenario (b) failure bound: with all weight sources blocked NOTHING reports
 * progress, so the idle window expires exactly once and the warmup must REJECT
 * within it (135s with headroom). This proves "fails loudly within the bound",
 * not merely "doesn't hang forever", and tracks the config value if it changes.
 */
const FAILURE_TIMEOUT_MS = MODEL_LOAD_IDLE_TIMEOUT_MS + 15_000;

const RESULT_TIMEOUT_MS = 30_000;

const SEARCH_PLACEHOLDER = "Search a name, e.g. Ivan Fakovich";

/** Hosts transformers.js could reach for weights — the HF hub and its LFS CDN —
 * plus jsDelivr, onnxruntime-web's default origin for its wasm LOADER module.
 * Blocking only the HF globs is NOT enough: the loader dependency stays
 * invisible until jsDelivr itself is aborted (found live on this repo). */
const CDN_GLOBS = [
	"**huggingface.co/**",
	"**cdn-lfs**",
	"**hf.co/**",
	"**cdn.jsdelivr.net/**",
];

/** Google Fonts hosts — the marketing landing's Fraunces / Hanken faces used to
 * be pulled from here via a `<link>` in index.html that fired on EVERY route,
 * including /screen. Self-hosting to a local-or-system stack killed that; these
 * globs prove /screen now makes ZERO font-CDN requests (same zero-egress bar as
 * the model + ORT loader). */
const FONT_CDN_GLOBS = ["**fonts.googleapis.com/**", "**fonts.gstatic.com/**"];

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

test("self-host serves the model AND the ORT wasm loader when HF + jsDelivr are blocked — zero CDN dependency", async ({
	page,
	context,
}) => {
	test.setTimeout(240_000);
	const errors = collectErrors(page);

	// Abort every request to the HF hub / its LFS CDN / jsDelivr, and record that
	// the runtime never even tried to reach them (the same-origin self-host paths
	// — /models/ and /ort/ — must be the only ones used). Context-level routing so
	// dedicated-Worker requests (the embedder Worker's ORT loader import) are
	// covered too.
	let hitCdn = 0;
	for (const glob of CDN_GLOBS) {
		await context.route(glob, (route) => {
			hitCdn += 1;
			return route.abort();
		});
	}

	// Independently count any font-CDN request. Self-hosting means /screen must
	// never reach fonts.googleapis.com / fonts.gstatic.com — this stays 0.
	let hitFontCdn = 0;
	for (const glob of FONT_CDN_GLOBS) {
		await context.route(glob, (route) => {
			hitFontCdn += 1;
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

	// The runtime never depended on huggingface.co OR jsDelivr: nothing reached
	// the blocked hosts, and the minified model-load path threw no console errors
	// (the useBrowserCache re-enable guard — a return of the es2020 crash trips
	// this).
	expect(hitCdn, "the runtime hit a blocked CDN host").toBe(0);
	// Zero font egress: index.html no longer links a web-font CDN, so /screen
	// (and every route) resolves fonts local-or-system only.
	expect(hitFontCdn, "the page hit a blocked font-CDN host").toBe(0);
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

	// Warm-cache HIT: reload the SAME page (CDN routes are still aborted, /models/
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

	// Block BOTH the CDNs and the same-origin /models/ mirror: the model can load
	// from nowhere, so the warmup must reject (bounded by
	// VITE_MODEL_LOAD_IDLE_TIMEOUT_MS — no progress ever arrives, so it expires).
	for (const glob of [...CDN_GLOBS, "**/models/**"]) {
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
