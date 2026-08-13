import { expect, test } from "@playwright/test";

test("screening boots when WebKit exposes OPFS but cannot open it", async ({
	page,
}) => {
	test.setTimeout(180_000);
	const consoleErrors: string[] = [];
	const requestOrigins = new Set<string>();
	page.on("request", (request) => {
		requestOrigins.add(new URL(request.url()).origin);
	});
	page.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});
	page.on("pageerror", (error) => consoleErrors.push(error.message));

	await page.goto("/screen");
	const expectedOrigin = new URL(page.url()).origin;
	const search = page.getByLabel("Search the sanctions list", { exact: true });
	await expect(search).toBeEnabled({ timeout: 120_000 });
	await search.fill("Ivan Fakovich");
	await expect(page.getByText(/potential match/i).first()).toBeVisible({
		timeout: 30_000,
	});

	await page.reload();
	await expect(search).toBeEnabled({ timeout: 120_000 });
	await expect(
		page.getByRole("alert").filter({ hasText: "Browser memory limit reached" }),
	).toHaveCount(0);
	expect([...requestOrigins]).toEqual([expectedOrigin]);
	expect(consoleErrors).toEqual([]);
});

/**
 * Settings must be usable on constrained browsers without constructing the
 * ONNX/WASM model. This catches the production failure where Safari reported
 * an out-of-memory engine error before the user had requested screening.
 */
test("settings defers model/WASM allocation on mobile profiles", async ({
	page,
}) => {
	const modelRequests: string[] = [];
	const consoleErrors: string[] = [];
	page.on("request", (request) => {
		if (/\/(?:models|ort)\//.test(request.url())) {
			modelRequests.push(request.url());
		}
	});
	page.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});
	page.on("pageerror", (error) => consoleErrors.push(error.message));

	await page.goto("/settings");
	const name = page.getByLabel("Analyst name", { exact: true });
	const dbError = page
		.getByRole("alert")
		.filter({ hasText: "Local workspace unavailable" });
	await expect(name.or(dbError)).toBeVisible({ timeout: 30_000 });
	// Playwright's bundled WebKit does not expose the OPFS/SQLite worker surface
	// used by the workstation (real iOS Safari does). Keep this result explicit
	// rather than treating an emulator limitation as a product pass/failure.
	if (await dbError.isVisible()) {
		test.skip(
			true,
			"Playwright WebKit lacks the OPFS/SQLite surface required by the workstation; verify on physical iOS Safari",
		);
	}

	await name.fill("Mobile Smoke Analyst");
	await page.getByRole("button", { name: "Start reviewing" }).click();

	await expect(
		page.getByRole("heading", { level: 1, name: "Settings" }),
	).toBeVisible();
	await expect(page.getByText("Loading settings…")).not.toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Cached lists" }),
	).toBeVisible();

	// Give background effects a chance to run. A settings visit must not fetch
	// the model or ORT WASM; screening routes own that explicit allocation.
	await page.waitForTimeout(500);
	expect(modelRequests).toEqual([]);
	expect(consoleErrors).toEqual([]);
});
