import { expect, test } from "@playwright/test";

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
	const dbError = page.getByText(/could not open the local KYC database/i);
	await expect(name.or(dbError)).toBeVisible();
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
