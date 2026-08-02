import { expect, type Page, test } from "@playwright/test";

/**
 * retry-recovers — the Retry button is the ONLY exit a stranded visitor has, so
 * it is the one control that must be proven by clicking it.
 *
 * Everything else in this suite proves a boot either succeeds or fails safely.
 * None of it proves the recovery path: that after a failed cold sync, pressing
 * Retry re-boots the engine and leaves a WORKING app. That gap has bitten this
 * portfolio before — an update banner shipped that had never activated anything
 * — so "the banner appeared" is not accepted here as evidence that Retry works.
 *
 * The failure injected is a total chunk outage, which is the realistic strand:
 * the signed pointer and manifest arrive, then the network dies mid-download.
 * The outage is then LIFTED before Retry is pressed, exactly as it would be for
 * a visitor who reconnected and pressed the button.
 *
 * Proven able to fail: make `retryBoot` in ScreenPage.tsx stop bumping its boot
 * nonce and this ends on the banner, never reaching a screenable page.
 */

const READY_TIMEOUT_MS = 160_000;

async function expectScreenable(page: Page): Promise<void> {
	const search = page.getByPlaceholder("Search a name, e.g. Ivan Fakovich");
	await expect(search).toBeVisible();
	await expect(search).toBeEnabled({ timeout: READY_TIMEOUT_MS });
}

test("Retry recovers a boot that failed on a chunk outage", async ({
	page,
	context,
}) => {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));

	let offline = true;
	let abortedChunks = 0;
	await context.route("**/bundle/origin/chunk/**", async (route) => {
		if (offline) {
			abortedChunks += 1;
			await route.abort("connectionfailed");
			return;
		}
		await route.continue();
	});

	await page.goto("/screen");

	// 1. The strand: the retry ladder is exhausted and the visitor is given the
	//    banner. (This also proves the ladder gives UP — an unbounded ladder
	//    would leave a permanently offline visitor on a spinner instead.)
	const alert = page.locator("[role='alert']");
	await expect(alert.first()).toBeVisible({ timeout: 90_000 });
	await expect(alert.first()).toContainText("could not be loaded");
	// The outage really was injected into the Worker's own fetch path, and the
	// widened ladder really did retry rather than give up on first contact.
	expect(abortedChunks).toBeGreaterThan(1);

	// 2. The visitor reconnects and presses the only control they have.
	offline = false;
	const retry = page.getByRole("button", { name: /retry/i });
	await expect(retry).toBeVisible();
	await retry.click();

	// 3. Recovery is a WORKING app, not merely a page that stopped complaining:
	//    the banner clears, the engine reaches ready, and the committed
	//    sanctioned name actually screens.
	await expectScreenable(page);
	expect(await alert.count()).toBe(0);

	const search = page.getByPlaceholder("Search a name, e.g. Ivan Fakovich");
	await search.fill("Ivan Fakovich");
	await expect(page.getByText(/Ivan Fakovich/i).first()).toBeVisible({
		timeout: 30_000,
	});

	// A recovered boot leaves a clean page, not a swallowed crash.
	expect(pageErrors).toEqual([]);
});
