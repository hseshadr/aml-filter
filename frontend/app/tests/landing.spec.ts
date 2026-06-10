import { expect, test } from "@playwright/test";

// Drives the public marketing landing at "/" in a real browser on secure-context
// localhost — the regression guard for the front door every visitor sees. Covers
// the rendered sections, both CTAs navigating, a clean console, and a mobile width.

test.describe("public landing (/)", () => {
	test("renders every section with a clean console", async ({ page }) => {
		const consoleErrors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") {
				consoleErrors.push(msg.text());
			}
		});
		page.on("pageerror", (err) => consoleErrors.push(err.message));

		await page.goto("http://localhost:5173/");

		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /entirely in your browser/i,
			}),
		).toBeVisible();
		await expect(page.getByRole("region", { name: /metrics/i })).toBeVisible();
		await expect(page.getByText("$0")).toBeVisible();
		await expect(page.getByRole("region", { name: /^why$/i })).toBeVisible();
		await expect(
			page.getByRole("region", { name: /how it works/i }),
		).toBeVisible();
		await expect(
			page.getByRole("region", { name: /compliance workstation/i }),
		).toBeVisible();
		await expect(page.getByText(/portfolio demo/i)).toBeVisible();

		expect(consoleErrors).toEqual([]);
	});

	test("primary CTA navigates to the in-browser demo", async ({ page }) => {
		await page.goto("http://localhost:5173/");
		await page.getByRole("link", { name: /try the live demo/i }).click();
		await expect(page).toHaveURL(/.*\/screen/);
	});

	test("secondary CTA navigates to the workstation", async ({ page }) => {
		await page.goto("http://localhost:5173/");
		await page.getByRole("link", { name: /open the workstation/i }).click();
		await expect(page).toHaveURL(/.*\/customers/);
	});

	test("renders without horizontal overflow at a 375px mobile width", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 375, height: 800 });
		await page.goto("http://localhost:5173/");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /entirely in your browser/i,
			}),
		).toBeVisible();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth > window.innerWidth + 1,
		);
		expect(overflow).toBe(false);
	});
});
