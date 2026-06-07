import { expect, test } from "@playwright/test";

/**
 * e2e-kyc — the FULL DB-backed KYC / AML compliance journey, driven in a real
 * headless Chromium against a LIVE FastAPI + PostgreSQL backend over the minified
 * production SPA. This is the permanent regression guard for the auth-gated
 * compliance pages (`/customers`, `/review`, `/sars`, `/attestations`, `/lists`)
 * that the backend-free C1 `/screen` suite never touched.
 *
 * It asserts REAL outcomes, not element presence:
 *   - onboarding a customer whose name matches the seeded sanctions entity surfaces
 *     a real sanctions-match warning and a live STRONG-tier match;
 *   - a disposition (reviewer + notes) persists across a reload;
 *   - a SAR exports a real PDF (bytes start with the %PDF magic header) and flips
 *     to EXPORTED;
 *   - an attestation generates, verifies VALID (signed against the pinned key), and
 *     downloads as a real PDF;
 *   - a list toggle persists across a reload;
 *   - the browser console stays error-free across the whole journey;
 *   - the STRONG gate holds: a non-STRONG match offers no "File SAR".
 *
 * Fixture (seeded by `scripts/seed_e2e_kyc.py` before the API boots):
 *   tenant + a FIXED API key, a global OFAC_SDN sanctions entity with embedding,
 *   an enabled OFAC_SDN list, and a pre-onboarded POSSIBLE-match customer.
 */

// Keep in lockstep with backend/scripts/seed_e2e_kyc.py.
const API_KEY = "aml_e2e_kyc_fixed_key_do_not_use_in_prod";
const SANCTIONED_NAME = "Vladimir Kuznetsov Sanctioned";
const WEAK_CUSTOMER_REF = "CUST-WEAK-001";
const API_BASE = `http://127.0.0.1:${process.env.E2E_KYC_API_PORT ?? 8010}`;

// A unique customer reference per run keeps onboarding idempotent across reruns
// (the backend rejects a duplicate reference with a 409).
const STRONG_CUSTOMER_REF = `CUST-STRONG-${Date.now()}`;

const PDF_MAGIC = "%PDF";

test.describe.configure({ mode: "serial" });

test("full KYC compliance journey: onboard → review → SAR → attestation → lists", async ({
	page,
}) => {
	test.setTimeout(120_000);

	// --- Console hygiene: collect every error across the whole journey. -------
	const consoleErrors: string[] = [];
	page.on("pageerror", (err) =>
		consoleErrors.push(`pageerror: ${err.message}`),
	);
	page.on("console", (msg) => {
		if (msg.type() === "error")
			consoleErrors.push(`console.error: ${msg.text()}`);
	});

	// =========================================================================
	// 1. LOG IN with the seeded API key (drive the real /login form).
	// =========================================================================
	await page.goto("/login");
	await expect(page).toHaveTitle(/AML-Filter/i); // guard against the port-collision trap
	await page.locator("#api-key").fill(API_KEY);
	await page.getByRole("button", { name: "Login" }).click();
	// After login the app navigates to "/" (the protected home).
	await expect(page).toHaveURL(/\/$/);

	// =========================================================================
	// 2. ONBOARD a customer whose name matches the seeded sanctions entity.
	// =========================================================================
	await page.goto("/customers");
	await expect(
		page.getByRole("heading", { name: "KYC Customer Onboarding" }),
	).toBeVisible();
	await page.locator("#customer-reference").fill(STRONG_CUSTOMER_REF);
	await page.locator("#customer-name").fill(SANCTIONED_NAME);
	await page.getByRole("button", { name: "Onboard" }).click();

	// The onboard result alert must flag a potential sanctions match (warning),
	// not the clean-success variant.
	const onboardAlert = page.locator(".alert-warning");
	await expect(onboardAlert).toContainText(/potential sanctions match/i);
	await expect(onboardAlert).toContainText(STRONG_CUSTOMER_REF);
	// The new customer row appears in the table.
	await expect(
		page.getByRole("cell", { name: STRONG_CUSTOMER_REF, exact: true }),
	).toBeVisible();

	// Resolve the onboarded customer_id from the live API (the attestation page
	// needs it, and it is not surfaced in the UI table).
	const strongCustomerId = await resolveCustomerId(page, STRONG_CUSTOMER_REF);
	expect(
		strongCustomerId,
		"onboarded customer must exist via the API",
	).toBeTruthy();

	// =========================================================================
	// 3. REVIEW BOARD: STRONG tier renders; resolve persists across a reload.
	// =========================================================================
	await page.goto("/review");
	await expect(
		page.getByRole("heading", { name: "Review Board" }),
	).toBeVisible();

	// The row for our onboarded customer (filter to STRONG to be unambiguous).
	await page.locator("#tier-filter").selectOption("STRONG");
	const strongRow = page.locator("tbody tr", { hasText: STRONG_CUSTOMER_REF });
	await expect(strongRow).toBeVisible();
	await expect(
		strongRow.locator(".badge", { hasText: "STRONG" }),
	).toBeVisible();

	// Apply a disposition with reviewer + notes.
	const reviewerId = "analyst-e2e";
	const reviewNotes = "Confirmed true positive in e2e journey.";
	await strongRow
		.getByRole("combobox", {
			name: new RegExp(`Disposition for ${STRONG_CUSTOMER_REF}`),
		})
		.selectOption("TRUE_POSITIVE");
	await strongRow
		.getByRole("textbox", {
			name: new RegExp(`Reviewer for ${STRONG_CUSTOMER_REF}`),
		})
		.fill(reviewerId);
	await strongRow
		.getByRole("textbox", {
			name: new RegExp(`Notes for ${STRONG_CUSTOMER_REF}`),
		})
		.fill(reviewNotes);
	await strongRow.getByRole("button", { name: "Resolve" }).click();

	// In-place: the row now shows TRUE_POSITIVE + the reviewer/notes.
	await expect(
		strongRow.locator(".badge", { hasText: "TRUE_POSITIVE" }),
	).toBeVisible();
	await expect(strongRow).toContainText(reviewerId);

	// Persistence: reload and re-query — the disposition survived the round trip.
	await page.reload();
	await page.locator("#tier-filter").selectOption("STRONG");
	const reloadedRow = page.locator("tbody tr", {
		hasText: STRONG_CUSTOMER_REF,
	});
	await expect(
		reloadedRow.locator(".badge", { hasText: "TRUE_POSITIVE" }),
	).toBeVisible();
	await expect(reloadedRow).toContainText(reviewerId);
	await expect(reloadedRow).toContainText(reviewNotes);

	// =========================================================================
	// 4. STRONG-GATE NEGATIVE: a non-STRONG (POSSIBLE) match offers no File SAR.
	// =========================================================================
	await page.goto("/review");
	await page.locator("#tier-filter").selectOption("POSSIBLE");
	const weakRow = page.locator("tbody tr", { hasText: WEAK_CUSTOMER_REF });
	await expect(weakRow).toBeVisible();
	await expect(
		weakRow.locator(".badge", { hasText: "POSSIBLE" }),
	).toBeVisible();
	// The SAR cell must NOT contain a "File SAR" button for a non-STRONG row.
	await expect(weakRow.getByRole("button", { name: "File SAR" })).toHaveCount(
		0,
	);

	// =========================================================================
	// 5. SAR: file from the STRONG row, export a real PDF, assert EXPORTED.
	// =========================================================================
	await page.goto("/review");
	await page.locator("#tier-filter").selectOption("STRONG");
	const sarSourceRow = page.locator("tbody tr", {
		hasText: STRONG_CUSTOMER_REF,
	});
	await sarSourceRow.getByRole("button", { name: "File SAR" }).click();

	// SAR form: prefilled subject + filer/narrative fields.
	await expect(page).toHaveURL(/\/sars\/new/);
	await expect(page.getByRole("heading", { name: "File a SAR" })).toBeVisible();
	await page.locator("#filer-name").fill("Jane Compliance");
	await page.locator("#filer-institution").fill("E2E Bank N.A.");
	await page.locator("#filer-contact").fill("compliance@e2ebank.example");
	await page
		.locator("#sar-narrative")
		.fill(
			"Customer is a STRONG match to a sanctioned individual; filing per policy.",
		);
	await page.getByRole("button", { name: "File SAR" }).click();

	// Lands on /sars with our SAR row present.
	await expect(page).toHaveURL(/\/sars$/);
	const sarRow = page.locator("tbody tr", { hasText: SANCTIONED_NAME }).first();
	await expect(sarRow).toBeVisible();

	// Export PDF and assert the downloaded bytes start with the %PDF magic header.
	const downloadPromise = page.waitForEvent("download");
	await sarRow.getByRole("button", { name: "Export PDF" }).click();
	const sarPdf = await downloadPromise;
	await assertPdfDownload(sarPdf, PDF_MAGIC);

	// Exporting flips the SAR status to EXPORTED (the page reloads the list).
	await expect(sarRow.locator(".badge", { hasText: "EXPORTED" })).toBeVisible();

	// =========================================================================
	// 6. ATTESTATION: generate, verify VALID, download the badge PDF.
	// =========================================================================
	await page.goto("/attestations");
	await expect(
		page.getByRole("heading", { name: "Screening Attestations" }),
	).toBeVisible();
	await page.locator("#attestation-customer-id").fill(strongCustomerId);
	await page.getByRole("button", { name: "Generate" }).click();

	// The attestation row for our customer appears with a status badge.
	const attRow = page.locator("tbody tr").first();
	await expect(attRow).toBeVisible();
	await expect(attRow.locator(".badge").first()).toBeVisible();
	// Signed (the API is wired with a matching signing key).
	await expect(attRow.locator(".badge", { hasText: "Signed" })).toBeVisible();

	// Verify -> the signature is VALID against the pinned trust-root key.
	await attRow.getByRole("button", { name: "Verify" }).click();
	await expect(attRow.locator(".badge", { hasText: "Valid" })).toBeVisible();

	// Download the badge (PDF) and assert real PDF bytes.
	const attDownloadPromise = page.waitForEvent("download");
	await attRow.getByRole("button", { name: "PDF" }).click();
	const attPdf = await attDownloadPromise;
	await assertPdfDownload(attPdf, PDF_MAGIC);

	// =========================================================================
	// 7. LISTS: toggle a list and assert it persists across a reload.
	// =========================================================================
	await page.goto("/lists");
	await expect(
		page.getByRole("heading", { name: "Compliance Lists" }),
	).toBeVisible();
	const ofacToggle = page.getByRole("checkbox", { name: "Enable OFAC_SDN" });
	await expect(ofacToggle).toBeVisible();

	const wasEnabled = await ofacToggle.isChecked();
	// The checkbox is a CONTROLLED input whose state is driven by the PUT response,
	// so `setChecked` (which verifies synchronously) races the async re-render. Click
	// and then assert with retry against the settled state instead.
	await ofacToggle.click();
	await expect(ofacToggle).toBeChecked({ checked: !wasEnabled });

	// Persist across reload.
	await page.reload();
	const reloadedToggle = page.getByRole("checkbox", {
		name: "Enable OFAC_SDN",
	});
	await expect(reloadedToggle).toBeChecked({ checked: !wasEnabled });

	// Restore the original state so the suite is idempotent for the next run.
	await reloadedToggle.click();
	await expect(reloadedToggle).toBeChecked({ checked: wasEnabled });

	// =========================================================================
	// 8. CONSOLE HYGIENE: zero browser errors across the entire journey.
	// =========================================================================
	expect(
		consoleErrors,
		`browser console errors:\n${consoleErrors.join("\n")}`,
	).toEqual([]);
});

/** Read a downloaded artifact back and assert it begins with the given magic header. */
async function assertPdfDownload(
	download: { path(): Promise<string | null> },
	magic: string,
): Promise<void> {
	const path = await download.path();
	expect(path, "download must have a local path").toBeTruthy();
	const { readFile } = await import("node:fs/promises");
	const bytes = await readFile(path as string);
	expect(bytes.length, "downloaded artifact must be non-empty").toBeGreaterThan(
		0,
	);
	expect(bytes.subarray(0, magic.length).toString("latin1")).toBe(magic);
}

/** Look up the onboarded customer's id via the live API (not surfaced in the UI). */
async function resolveCustomerId(
	page: { request: { get: (url: string, opts: unknown) => Promise<unknown> } },
	reference: string,
): Promise<string> {
	const response = (await page.request.get(`${API_BASE}/v1/customers`, {
		headers: { "X-API-Key": API_KEY },
	})) as {
		ok(): boolean;
		json(): Promise<Array<{ customer_id: string; customer_reference: string }>>;
	};
	expect(response.ok(), "customers API must return ok").toBeTruthy();
	const customers = await response.json();
	const match = customers.find((c) => c.customer_reference === reference);
	return match ? match.customer_id : "";
}
