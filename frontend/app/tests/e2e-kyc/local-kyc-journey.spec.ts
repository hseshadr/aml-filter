import { expect, test } from "@playwright/test";

/**
 * The local-first KYC workstation slice journey, end-to-end with no backend:
 *
 *   open /customers with NO login → one-time analyst name → onboard a
 *   customer whose name is in the committed signed demo bundle → the
 *   sanctions-match warning fires → the Review Board shows the TIERED match
 *   → resolve it (reviewer stamped from the analyst settings row) → reload:
 *   the customer, the match, and the disposition all survived (OPFS).
 *
 * Asserts REAL outcomes (rendered tiers, persisted rows, dup-rejection,
 * console hygiene), against the REAL minified build + the REAL signed bundle
 * (backend/examples/catalog) + the REAL pinned key — per the CLAUDE.md
 * browser-validation mandate.
 */

// "Ivan Fakovich" is entity DEMO_SDN:0001 in backend/examples/demo_entities.jsonl
// (countries: RU) — the same name the C1 /screen e2e matches against.
const SANCTIONED_NAME = "Ivan Fakovich";
const CUSTOMER_REF = "CUST-LOCAL-001";
const ANALYST = "Avery Analyst";
const REVIEW_NOTES = "Resolved as noise in the local-first e2e journey.";

test.describe.configure({ mode: "serial" });

test("local-first journey: no login → onboard → tiered match → resolve → persists", async ({
	page,
}) => {
	test.setTimeout(180_000);

	// --- Console hygiene across the whole journey. -------------------------
	const consoleErrors: string[] = [];
	page.on("pageerror", (err) =>
		consoleErrors.push(`pageerror: ${err.message}`),
	);
	page.on("console", (msg) => {
		if (msg.type() === "error")
			consoleErrors.push(`console.error: ${msg.text()}`);
	});

	// =======================================================================
	// 1. The workstation is reachable directly — no login, no API key.
	// =======================================================================
	await page.goto("/customers");
	await expect(page).toHaveTitle(/AML-Filter/i); // port-collision guard
	await expect(page).toHaveURL(/\/customers$/);

	// =======================================================================
	// 2. One-time analyst name (a SQLite settings row).
	// =======================================================================
	await expect(
		page.getByRole("heading", { name: /welcome to the workstation/i }),
	).toBeVisible();
	await page.locator("#analyst-name").fill(ANALYST);
	await page.getByRole("button", { name: /start reviewing/i }).click();
	await expect(
		page.getByRole("heading", { name: "KYC Customer Onboarding" }),
	).toBeVisible();

	// =======================================================================
	// 3. Onboard a sanctioned name: in-tab screen → tiered match persisted.
	//    (Submitting awaits the engine internally — sync + ~23 MB model.)
	// =======================================================================
	await page.locator("#customer-reference").fill(CUSTOMER_REF);
	await page.locator("#customer-name").fill(SANCTIONED_NAME);
	await page.locator("#customer-country").fill("RU");
	await page.getByRole("button", { name: "Onboard" }).click();

	const onboardAlert = page.locator(".alert-warning");
	await expect(onboardAlert).toContainText(/potential sanctions match/i, {
		timeout: 120_000, // first run downloads the model
	});
	await expect(onboardAlert).toContainText(CUSTOMER_REF);
	await expect(
		page.getByRole("cell", { name: CUSTOMER_REF, exact: true }),
	).toBeVisible();

	// =======================================================================
	// 4. Review Board: the match renders TIERED and PENDING.
	// =======================================================================
	await page.goto("/review");
	await expect(
		page.getByRole("heading", { name: "Review Board" }),
	).toBeVisible();
	await page.locator("#status-filter").selectOption("PENDING");
	const row = page.locator("tbody tr", { hasText: CUSTOMER_REF });
	await expect(row).toBeVisible();
	// The tier is computed by the parity-locked classifier over the real
	// score; an exact self-match sits at the STRONG/POSSIBLE boundary, so
	// assert a real tier badge rather than hardcoding the band.
	await expect(
		row.locator(".badge", { hasText: /^(STRONG|POSSIBLE)$/ }),
	).toBeVisible();
	await expect(row.locator(".badge", { hasText: "PENDING" })).toBeVisible();
	await expect(row).toContainText(SANCTIONED_NAME);

	// =======================================================================
	// 5. Resolve with notes, reviewer left BLANK — the analyst settings row
	//    must stamp the audit trail (spec §9.5).
	// =======================================================================
	await row
		.getByRole("combobox", {
			name: new RegExp(`Disposition for ${CUSTOMER_REF}`),
		})
		.selectOption("FALSE_POSITIVE");
	await row
		.getByRole("textbox", { name: new RegExp(`Notes for ${CUSTOMER_REF}`) })
		.fill(REVIEW_NOTES);
	await row.getByRole("button", { name: "Resolve" }).click();
	await expect(
		row.locator(".badge", { hasText: "FALSE_POSITIVE" }),
	).toBeVisible();
	await expect(row).toContainText(ANALYST);

	// =======================================================================
	// 6. Persistence: reload — everything is still there (SQLite in OPFS).
	// =======================================================================
	await page.reload();
	const reloadedRow = page.locator("tbody tr", { hasText: CUSTOMER_REF });
	await expect(reloadedRow).toBeVisible();
	await expect(
		reloadedRow.locator(".badge", { hasText: "FALSE_POSITIVE" }),
	).toBeVisible();
	await expect(reloadedRow).toContainText(ANALYST);
	await expect(reloadedRow).toContainText(REVIEW_NOTES);

	// …and it has LEFT the pending queue (spec §8.3): filtering to PENDING
	// after the reload shows no row for this customer.
	await page.locator("#status-filter").selectOption("PENDING");
	await expect(page.locator("tbody tr", { hasText: CUSTOMER_REF })).toHaveCount(
		0,
	);
	await page.locator("#status-filter").selectOption("");

	// The analyst name persisted too: no re-prompt on the customers page.
	await page.goto("/customers");
	await expect(
		page.getByRole("heading", { name: "KYC Customer Onboarding" }),
	).toBeVisible();
	await expect(
		page.getByRole("cell", { name: CUSTOMER_REF, exact: true }),
	).toBeVisible();

	// =======================================================================
	// 7. Dup-rejection: onboarding the same reference fails loudly.
	// =======================================================================
	await page.locator("#customer-reference").fill(CUSTOMER_REF);
	await page.locator("#customer-name").fill(SANCTIONED_NAME);
	await page.getByRole("button", { name: "Onboard" }).click();
	await expect(page.locator(".alert-error")).toContainText(/already exists/i);

	// =======================================================================
	// 8. Console hygiene: zero browser errors across the entire journey.
	// =======================================================================
	expect(
		consoleErrors,
		`browser console errors:\n${consoleErrors.join("\n")}`,
	).toEqual([]);
});
