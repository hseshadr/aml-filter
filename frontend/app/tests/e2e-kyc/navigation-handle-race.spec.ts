import { expect, type Page, test } from "@playwright/test";

/**
 * e2e-kyc — full-page navigation between DB-backed routes must never surface
 * the "already open in another tab?" banner. This is the exact failure
 * reproduced live on aml-filter.com: a URL load / refresh from one workstation
 * route to another tears down the outgoing page's DB worker, whose six
 * opfs-sahpool SyncAccessHandles are released ASYNCHRONOUSLY — the incoming
 * page's worker races that release, and losing threw
 * NoModificationAllowedError straight into the boot-error banner on first
 * paint (a manual Retry seconds later always succeeded). The worker now
 * absorbs that race with a short bounded acquisition retry
 * (@amlfilter/workstation db/acquire.ts), so every hop below must land on the
 * page's real content with no banner.
 *
 * Driven against the MINIFIED production build over the COMMITTED signed
 * bundle, per the CLAUDE.md browser-validation mandate. `http://localhost` is
 * a secure context — REQUIRED for OPFS.
 *
 * Deliberately NO clean-console assertion here: when a hop actually loses the
 * first acquisition attempt, sqlite-wasm's failed-install cleanup logs
 * console errors before the retry succeeds (printErr is intentionally never
 * muted — fail-closed diagnostics). The contract under test is the USER
 * outcome: content renders, no error banner.
 */

const ANALYST = "Nav Race Analyst";
const BANNER_TEXT = /already open in another tab/i;

/** The gate's boot-failure banner (raw worker message + Retry button). */
async function expectNoOpenFailureBanner(page: Page): Promise<void> {
	await expect(page.getByText(BANNER_TEXT)).toHaveCount(0);
}

test("full-page hops across /customers → /review → /settings → /customers survive the OPFS handle-release race", async ({
	page,
}) => {
	// ------------------------------------------------------------------
	// 1. Cold boot on /customers: fresh OPFS, so the one-time analyst-name
	//    gate appears — completing it proves the DB opened and writes the
	//    settings row the later hops will re-read.
	// ------------------------------------------------------------------
	await page.goto("/customers");
	await expect(page).toHaveTitle(/AML-Filter/i); // port-collision guard
	await expect(
		page.getByRole("heading", { name: /welcome to the workstation/i }),
	).toBeVisible();
	await page.locator("#analyst-name").fill(ANALYST);
	await page.getByRole("button", { name: /start reviewing/i }).click();
	await expect(
		page.getByRole("heading", { name: "KYC Customer Onboarding" }),
	).toBeVisible();

	// ------------------------------------------------------------------
	// 2. Full-page load to /review — the outgoing page's worker still holds
	//    the handle pool while this document's worker acquires. The board
	//    must render; the banner must not.
	// ------------------------------------------------------------------
	await page.goto("/review");
	await expect(
		page.getByRole("heading", { name: "Review Board" }),
	).toBeVisible();
	await expectNoOpenFailureBanner(page);

	// ------------------------------------------------------------------
	// 3. Full-page load to /settings — same race, next hop.
	// ------------------------------------------------------------------
	await page.goto("/settings");
	await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Watchlists" })).toBeVisible();
	await expectNoOpenFailureBanner(page);

	// ------------------------------------------------------------------
	// 4. Back to /customers via full load: no welcome gate this time — the
	//    analyst-name row written in step 1 is read back from OPFS, proving
	//    the reopened database is the SAME persisted store, not a recovery
	//    artifact.
	// ------------------------------------------------------------------
	await page.goto("/customers");
	await expect(
		page.getByRole("heading", { name: "KYC Customer Onboarding" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: /welcome to the workstation/i }),
	).toHaveCount(0);
	await expectNoOpenFailureBanner(page);
});

test("a second tab boots into REAL pool contention and takes over once the first tab closes", async ({
	context,
}) => {
	// Deterministic version of the navigation race: tab A genuinely HOLDS the
	// sahpool handles (no timing luck involved) while tab B boots. Without the
	// bounded retry, B's single acquisition attempt fails and the banner is up
	// within its first paint. With it, B silently retries; closing A inside
	// B's ~3s budget releases the handles asynchronously — the exact release
	// B must survive — and B's next attempt takes the pool over.
	const pageA = await context.newPage();
	await pageA.goto("/customers");
	await expect(
		pageA.getByRole("heading", { name: /welcome to the workstation/i }),
	).toBeVisible();
	await pageA.locator("#analyst-name").fill(ANALYST);
	await pageA.getByRole("button", { name: /start reviewing/i }).click();
	await expect(
		pageA.getByRole("heading", { name: "KYC Customer Onboarding" }),
	).toBeVisible();

	const pageB = await context.newPage();
	await pageB.goto("/review");
	// Contention window: give B time to burn its first acquisition attempts
	// while A still holds the pool. It must be quietly booting — no banner —
	// and it CANNOT have opened the single-connection pool yet (that the board
	// is absent proves real contention was exercised, not a lucky first try).
	await pageB.waitForTimeout(1200);
	await expectNoOpenFailureBanner(pageB);
	await expect(
		pageB.getByRole("heading", { name: "Review Board" }),
	).toHaveCount(0);

	// A closes inside B's retry budget; its handles release asynchronously.
	await pageA.close();
	await expect(
		pageB.getByRole("heading", { name: "Review Board" }),
	).toBeVisible();
	await expectNoOpenFailureBanner(pageB);
});
