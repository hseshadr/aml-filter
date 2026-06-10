import { expect, test } from "@playwright/test";

// Dev-suite shell checks (vite dev server): the local-first app has NO login —
// the workstation routes are directly reachable and the server-tier routes are
// unrouted. The full journey (real build + real signed bundle) lives in
// tests/e2e-kyc/local-kyc-journey.spec.ts.
test.describe("local-first app shell", () => {
	test("shows the public landing at /", async ({ page }) => {
		await page.goto("http://localhost:5173/");
		await expect(page).toHaveURL("http://localhost:5173/");
		await expect(page.locator("h1")).toContainText("entirely in your browser");
	});

	test("the workstation is reachable with no login gate", async ({ page }) => {
		await page.goto("http://localhost:5173/customers");
		// No redirect to /login; the gate boots the local DB and asks for the
		// one-time analyst name on a fresh profile.
		await expect(page).toHaveURL(/\/customers$/);
		await expect(
			page.getByRole("heading", { name: /welcome to the workstation/i }),
		).toBeVisible();
	});

	test("the nav links the workstation pages and hides the server tier", async ({
		page,
	}) => {
		await page.goto("http://localhost:5173/");
		await expect(page.getByRole("link", { name: "Customers" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Review" })).toBeVisible();
		for (const hidden of [
			"SARs",
			"Attestations",
			"Lists",
			"Usage",
			"API Keys",
			"Whitelist",
			"Search",
		]) {
			await expect(page.getByRole("link", { name: hidden })).toHaveCount(0);
		}
	});
});
