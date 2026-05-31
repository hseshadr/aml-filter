import { expect, test } from "@playwright/test";

// The in-browser OFAC screening page is a PUBLIC route (no auth) that boots the
// signed-bundle sync + MiniLM embedder in Web Workers on mount. A full sync +
// model download needs a served bundle origin and ~25 MB of weights, which is a
// heavier integration lane; this spec validates the page's static shell, its
// public-route reachability, and the attribution footer — all of which render
// immediately, before the async bootstrap resolves.

test.describe("In-browser OFAC screening page", () => {
	test("is reachable without logging in", async ({ page }) => {
		await page.goto("http://localhost:5173/screen");
		await expect(page).toHaveURL(/.*screen/);
		await expect(page.locator("h1")).toContainText("Screen a name");
	});

	test("explains it runs in the browser with nothing sent to a server", async ({
		page,
	}) => {
		await page.goto("http://localhost:5173/screen");
		await expect(
			page.getByText("nothing is sent to a server", { exact: false }),
		).toBeVisible();
	});

	test("renders the name input and the Screen button", async ({ page }) => {
		await page.goto("http://localhost:5173/screen");
		await expect(page.getByPlaceholder("e.g. Vladimir Ivanov")).toBeVisible();
		await expect(page.getByRole("button", { name: /Screen/ })).toBeVisible();
	});

	test("shows a boot/status banner while the bundle loads", async ({
		page,
	}) => {
		await page.goto("http://localhost:5173/screen");
		// role=status (booting) or role=alert (error) — either proves the runtime
		// kicked off; both are deterministic without a served bundle.
		await expect(
			page.locator('[role="status"], [role="alert"]').first(),
		).toBeVisible();
	});

	test("credits the public OFAC list in the footer (attribution)", async ({
		page,
	}) => {
		await page.goto("http://localhost:5173/screen");
		// Scope to the footer: "OFAC" also appears in the page lede, so a bare
		// getByText would be a strict-mode multi-match.
		const footer = page.locator("footer.screen-footer");
		await expect(footer).toContainText("portfolio demo");
		await expect(footer).toContainText("OFAC");
		await expect(footer).toContainText("NOTICE");
	});

	test("is linked from the global nav", async ({ page }) => {
		await page.goto("http://localhost:5173/login");
		await page.click("text=Screen (in-browser)");
		await expect(page).toHaveURL(/.*screen/);
	});
});
