import { expect, type Page, test } from "@playwright/test";

/**
 * blip-survival — the regression guard for the retry ladder's BUDGET.
 *
 * `transient-chunk-failure.spec.ts` next door proves the ladder retries at all
 * by killing exactly one chunk once. That is a different property, and it stays
 * green on a ladder far too short to be useful: two attempts pass it.
 *
 * What was actually measured against the live site on 2026-08-01 is this: a
 * THREE-SECOND network outage during the cold sync stranded the first boot 0/5.
 * Three attempts at a 250 ms base absorb only 750–1250 ms, so the ladder gave up
 * roughly 1.9 s before the network came back and the visitor got a Retry banner
 * for a blip they never even noticed. The fix is arithmetic — six attempts, a
 * 7.75–9.0 s budget — so the guard has to be arithmetic too: it asserts SECONDS
 * OF OUTAGE SURVIVED, not attempts taken.
 *
 * Proven able to fail: with CHUNK_FETCH_ATTEMPTS back at 3, this run ends on
 * "Screening list could not be loaded" instead of a screenable page.
 */

const OUTAGE_MS = 3_000;
const READY_TIMEOUT_MS = 160_000;

async function bootToReady(page: Page): Promise<void> {
	const search = page.getByPlaceholder("Search a name, e.g. Ivan Fakovich");
	await expect(search).toBeVisible();
	await expect(search).toBeEnabled({ timeout: READY_TIMEOUT_MS });
	const alert = page.locator("[role='alert']");
	if (await alert.count()) {
		throw new Error(`bootstrap errored: ${await alert.first().textContent()}`);
	}
}

test("a 3-second network outage mid-download is a pause, not a dead end", async ({
	page,
	context,
}) => {
	let offline = false;
	let refused = 0;
	let served = 0;

	await context.route("**/bundle/origin/chunk/**", async (route) => {
		if (offline) {
			refused += 1;
			await route.abort("connectionfailed");
			return;
		}
		served += 1;
		// The blip starts the moment the download is genuinely under way, so it
		// lands on in-flight chunk fetches rather than before the sync begins.
		if (served === 1) {
			offline = true;
			setTimeout(() => {
				offline = false;
			}, OUTAGE_MS);
		}
		await route.continue();
	});

	await page.goto("/screen");
	await bootToReady(page);

	// The outage really was injected into the Worker's own fetch path — without
	// this the test would still pass if routing silently stopped matching.
	expect(refused).toBeGreaterThan(0);

	// And the survived boot is a WORKING one, not a page that merely stopped
	// showing its banner: the committed sanctioned name must still screen.
	const search = page.getByPlaceholder("Search a name, e.g. Ivan Fakovich");
	await search.fill("Ivan Fakovich");
	await expect(page.getByText(/Ivan Fakovich/i).first()).toBeVisible({
		timeout: 30_000,
	});
});
