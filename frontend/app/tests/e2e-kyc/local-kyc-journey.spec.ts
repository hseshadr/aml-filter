import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Route, test } from "@playwright/test";

/**
 * The local-first KYC workstation slice journey, end-to-end with no backend:
 *
 *   open /customers with NO login → one-time analyst name → onboard a
 *   customer whose name is in the committed signed demo bundle → the
 *   sanctions-match warning fires → the Review Board shows the TIERED match
 *   → resolve it (reviewer stamped from the analyst settings row) → reload:
 *   the customer, the match, and the disposition all survived (OPFS) →
 *   a NEW watchlist is published → "Check for updates" detects it (real signed
 *   manifest poll), reloads + re-screens, and the disposition carries forward.
 *
 * Asserts REAL outcomes (rendered tiers, persisted rows, dup-rejection,
 * console hygiene), against the REAL minified build + the REAL committed signed
 * multi-list catalog (app/public/watchlist/catalog.json + per-list dirs) + the
 * REAL pinned key — per the CLAUDE.md browser-validation mandate.
 *
 * The new-publish step is driven the REAL way (no test seam): a SECOND signed
 * CATALOG with the OFAC list bumped to version "demo-2" (EU/UN/UK stay demo-1),
 * built by @amlfilter/publisher with the same demo key — see
 * packages/amlfilter-publisher/src/buildDemoCatalogV2.ts) lives under
 * fixtures/watchlist-v2-catalog/. A Playwright route serves the committed demo-1
 * catalog normally, then — once `servePublishV2` flips — serves the v2 catalog
 * (catalog.json(.sig) + each list's watchlist.json/.sig/.manifest.json(.sig)) so
 * the running tab's manifest/catalog poll sees a genuinely newer, validly-signed
 * catalog whose COMPOSITE version stamp now carries OFAC_SDN@demo-2.
 */

// "Ivan Fakovich" is entity OFAC_SDN:0001 in the committed signed OFAC list
// (countries: RU) — the same name the C1 /screen e2e matches against.
const SANCTIONED_NAME = "Ivan Fakovich";
const CUSTOMER_REF = "CUST-LOCAL-001";
const ANALYST = "Avery Analyst";
const REVIEW_NOTES = "Resolved as noise in the local-first e2e journey.";

const HERE = dirname(fileURLToPath(import.meta.url));
const V2_CATALOG_DIR = join(HERE, "fixtures", "watchlist-v2-catalog");

/** Content type for a fixture file, keyed off its extension. */
function contentTypeFor(relPath: string): string {
	return relPath.endsWith(".sig") ? "text/plain" : "application/json";
}

/**
 * Read a v2-catalog fixture file by its path relative to `watchlist/` (e.g.
 * "catalog.json", "ofac/watchlist.json.sig"). Returns null when the requested
 * path is not part of the fixture, so the route can fall through to the real
 * (committed demo-1) catalog instead of fabricating an artifact.
 */
function readV2CatalogFile(
	relPath: string,
): { body: Buffer; contentType: string } | null {
	const absPath = join(V2_CATALOG_DIR, relPath);
	if (!absPath.startsWith(`${V2_CATALOG_DIR}/`)) {
		return null; // guard against path traversal out of the fixture dir
	}
	try {
		return {
			body: readFileSync(absPath),
			contentType: contentTypeFor(relPath),
		};
	} catch {
		return null; // not a file in this fixture → let the real catalog serve
	}
}

test.describe.configure({ mode: "serial" });

test("local-first journey: no login → onboard → tiered match → resolve → persists → new publish re-screens → suppressed-unchanged + profile-edit CHANGED + settings rescan", async ({
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

	// --- New-publish route: serve the committed demo-1 catalog until the test
	//     flips `servePublishV2`, then serve the validly-signed demo-2 catalog
	//     (OFAC bumped) so the tab's catalog/manifest poll detects a real new
	//     publish. The fixture mirrors the watchlist/ layout, so each intercepted
	//     request path under /watchlist/ maps 1:1 to a fixture file. -----------
	let servePublishV2 = false;
	await page.route("**/watchlist/**", async (route: Route) => {
		if (!servePublishV2) {
			await route.continue();
			return;
		}
		const pathname = new URL(route.request().url()).pathname;
		const relPath = pathname.slice(pathname.indexOf("/watchlist/") + 11);
		const file = readV2CatalogFile(relPath);
		if (file === null) {
			await route.continue();
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: file.contentType,
			body: file.body,
		});
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
	// 6b. LIVE new-publish detection (the headline feature): a newer CATALOG
	//     (OFAC bumped to "demo-2", EU/UN/UK still "demo-1") goes live AFTER this
	//     tab booted on the all-demo-1 catalog. Flip the route to serve the
	//     validly-signed v2 catalog, then drive "Check for updates". The tab's
	//     cheap signed catalog/manifest poll must see the composite stamp advance
	//     (…|OFAC_SDN@demo-2|… ≠ …|OFAC_SDN@demo-1|…), RELOAD every list into the
	//     running engine (fail-closed verify), then re-screen every customer. The
	//     previously-resolved match MUST survive with its FALSE_POSITIVE
	//     disposition (proof replaceMatches carries the audit trail forward across
	//     a real reload + rescan).
	// =======================================================================
	servePublishV2 = true;
	await page.getByRole("button", { name: "Check for updates" }).click();
	// A real re-screen ran against the newly-published list (≥1 customer scanned).
	await expect(page.getByText(/Re-screened \d+ customer\(s\)/)).toBeVisible({
		timeout: 120_000,
	});
	// The UI now reports the advanced composite stamp as the last-synced version:
	// the OFAC list moved to demo-2 (EU/UN/UK stay demo-1), so the composite
	// "Last synced: …|OFAC_SDN@demo-2|…" carries OFAC_SDN@demo-2. Matching that
	// substring proves the new publish was genuinely detected and loaded, not the
	// frozen boot-time version.
	await expect(page.getByText(/OFAC_SDN@demo-2/)).toBeVisible();

	// The resolved match survived the rescan with its disposition preserved.
	await page.goto("/review");
	await expect(
		page.getByRole("heading", { name: "Review Board" }),
	).toBeVisible();
	const rescannedRow = page.locator("tbody tr", { hasText: CUSTOMER_REF });
	await expect(rescannedRow).toBeVisible();
	await expect(
		rescannedRow.locator(".badge", { hasText: "FALSE_POSITIVE" }),
	).toBeVisible();
	await expect(rescannedRow).toContainText(ANALYST);
	await expect(rescannedRow).toContainText(REVIEW_NOTES);

	// Reload after the rescan: customer, match, and resolution all persist (OPFS).
	await page.reload();
	const afterRescanReload = page.locator("tbody tr", { hasText: CUSTOMER_REF });
	await expect(afterRescanReload).toBeVisible();
	await expect(
		afterRescanReload.locator(".badge", { hasText: "FALSE_POSITIVE" }),
	).toBeVisible();
	await expect(afterRescanReload).toContainText(REVIEW_NOTES);

	// Back to /customers for the dup-rejection step.
	await page.goto("/customers");
	await expect(
		page.getByRole("heading", { name: "KYC Customer Onboarding" }),
	).toBeVisible();

	// =======================================================================
	// 7. Dup-rejection: onboarding the same reference fails loudly.
	// =======================================================================
	await page.locator("#customer-reference").fill(CUSTOMER_REF);
	await page.locator("#customer-name").fill(SANCTIONED_NAME);
	await page.getByRole("button", { name: "Onboard" }).click();
	await expect(page.locator(".alert-error")).toContainText(/already exists/i);

	// =======================================================================
	// 9 (Theme B / wave 2). Suppressed-on-unchanged-rescan + History trail.
	//
	//   Re-screening with NOTHING materially changed must keep the match
	//   suppressed as FALSE_POSITIVE — no fresh PENDING alert, no CHANGED flag.
	//   We drive a REAL re-screen via the row's Edit → Save affordance, saving
	//   the SAME identity ("Ivan Fakovich" / "RU"). screenCustomer recomputes
	//   the material fingerprint; an identical fingerprint carries the prior
	//   disposition forward with NO event (workstation operations.ts §6
	//   "unchanged -> carry forward, suppress"). The History drawer then proves
	//   the accumulated audit trail: DETECTED (onboard) + DISPOSITIONED (resolve).
	// =======================================================================
	const editTrigger = page.getByRole("button", {
		name: `Edit ${CUSTOMER_REF}`,
	});
	await expect(editTrigger).toBeVisible();
	await editTrigger.click();
	await page
		.getByRole("textbox", { name: `Edit name for ${CUSTOMER_REF}` })
		.fill(SANCTIONED_NAME);
	await page
		.getByRole("textbox", { name: `Edit country for ${CUSTOMER_REF}` })
		.fill("RU");
	await page.getByRole("button", { name: "Save" }).click();
	// The Save (re-screen) settled — the inline editor closed (Edit is back).
	await expect(
		page.getByRole("button", { name: `Edit ${CUSTOMER_REF}` }),
	).toBeVisible({ timeout: 120_000 });

	await page.goto("/review");
	await expect(
		page.getByRole("heading", { name: "Review Board" }),
	).toBeVisible();
	const unchangedRow = page.locator("tbody tr", { hasText: CUSTOMER_REF });
	await expect(unchangedRow).toBeVisible();
	// Still suppressed as FALSE_POSITIVE — the unchanged re-screen did not
	// re-open it, and it is NOT flagged CHANGED.
	await expect(
		unchangedRow.locator(".badge", { hasText: "FALSE_POSITIVE" }),
	).toBeVisible();
	await expect(unchangedRow).not.toContainText("CHANGED — needs re-review");
	// No NEW pending alert was raised for this customer by the unchanged rescan.
	await page.locator("#status-filter").selectOption("PENDING");
	await expect(page.locator("tbody tr", { hasText: CUSTOMER_REF })).toHaveCount(
		0,
	);
	await page.locator("#status-filter").selectOption("");

	// History: the drawer shows the DETECTED (onboard) and DISPOSITIONED
	// (resolve) events of the accumulated audit trail.
	await expect(unchangedRow).toBeVisible();
	await unchangedRow
		.getByRole("button", { name: `History for ${CUSTOMER_REF}` })
		.click();
	const historyA = page.locator("tbody tr:has(li)");
	await expect(historyA.getByText("DETECTED")).toBeVisible();
	await expect(historyA.getByText("DISPOSITIONED")).toBeVisible();
	// Collapse the drawer again before moving on.
	await unchangedRow
		.getByRole("button", { name: `History for ${CUSTOMER_REF}` })
		.click();

	// =======================================================================
	// 10 (Theme B / wave 2). Profile name-edit → CHANGED, with the full audit
	//     trail carried forward, surfaced by the View filter.
	//
	//   Edit the customer's NAME to a minor variation that still re-hits the
	//   SAME entity (DEMO_SDN:0001 "ivan fakovich"): "Ivan A. Fakovich" shares
	//   both identity-bearing tokens, so it scores above threshold, but the
	//   normalized profile differs → a NEW material fingerprint → CHANGED. The
	//   prior FALSE_POSITIVE disposition is carried forward and the row is
	//   flagged "CHANGED — needs re-review". A CHANGED row now exposes the inline
	//   Resolve controls (needsAction unions CHANGED), so we re-disposition it
	//   back to CURRENT and assert the accumulated audit trail.
	// =======================================================================
	const CHANGED_NAME = "Ivan A. Fakovich";
	await page.goto("/customers");
	await expect(
		page.getByRole("heading", { name: "KYC Customer Onboarding" }),
	).toBeVisible();
	await page.getByRole("button", { name: `Edit ${CUSTOMER_REF}` }).click();
	await page
		.getByRole("textbox", { name: `Edit name for ${CUSTOMER_REF}` })
		.fill(CHANGED_NAME);
	await page
		.getByRole("textbox", { name: `Edit country for ${CUSTOMER_REF}` })
		.fill("RU");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(
		page.getByRole("button", { name: `Edit ${CUSTOMER_REF}` }),
	).toBeVisible({ timeout: 120_000 });

	await page.goto("/review");
	await expect(
		page.getByRole("heading", { name: "Review Board" }),
	).toBeVisible();

	// The View filter narrows to "Changed only" — the materially-changed row
	// is listed there.
	await page.locator("#view-filter").selectOption("CHANGED");
	const changedRow = page.locator("tbody tr", { hasText: CUSTOMER_REF });
	await expect(changedRow).toBeVisible();
	await expect(changedRow.getByText("CHANGED — needs re-review")).toBeVisible();
	// It still carries the prior FALSE_POSITIVE disposition while flagged CHANGED.
	await expect(
		changedRow.locator(".badge", { hasText: "FALSE_POSITIVE" }),
	).toBeVisible();

	// History before re-disposition: the prior DISPOSITIONED (FALSE_POSITIVE)
	// event carried forward, PLUS a CHANGED event from the profile edit.
	await changedRow
		.getByRole("button", { name: `History for ${CUSTOMER_REF}` })
		.click();
	const changedHistory = page.locator("tbody tr:has(li)");
	await expect(changedHistory.getByText("DISPOSITIONED")).toBeVisible();
	await expect(
		changedHistory.locator("li", { hasText: "CHANGED" }),
	).toBeVisible();
	await changedRow
		.getByRole("button", { name: `History for ${CUSTOMER_REF}` })
		.click();

	// The "Needs review (new + changed)" view also surfaces the CHANGED row
	// (the query is `resolution_status = PENDING OR review_state = CHANGED`),
	// so a re-review queue includes it alongside fresh PENDING hits.
	await page.locator("#view-filter").selectOption("NEEDS_REVIEW");
	const needsReviewRow = page.locator("tbody tr", { hasText: CUSTOMER_REF });
	await expect(needsReviewRow).toBeVisible();
	await expect(
		needsReviewRow.getByText("CHANGED — needs re-review"),
	).toBeVisible();

	// Re-disposition the CHANGED row back to CURRENT. The ReviewBoardPage now
	// renders the inline Resolve controls when `needsAction(match)` is true —
	// `resolution_status === "PENDING" OR review_state === "CHANGED"` — so the
	// CHANGED row exposes the SAME controls a PENDING row does: the Disposition
	// select, Reviewer / Notes inputs, and the "Resolve" button. Re-confirm it
	// as FALSE_POSITIVE (the analyst re-reviewed the changed profile and stands
	// by the prior call). `resolveReviewMatch` writes a fresh DISPOSITIONED
	// event and resets `review_state` to CURRENT, so the CHANGED flag clears.
	const RE_REVIEW_NOTES = "Re-reviewed after profile edit; still noise.";
	await needsReviewRow
		.getByRole("combobox", {
			name: new RegExp(`Disposition for ${CUSTOMER_REF}`),
		})
		.selectOption("FALSE_POSITIVE");
	await needsReviewRow
		.getByRole("textbox", { name: new RegExp(`Notes for ${CUSTOMER_REF}`) })
		.fill(RE_REVIEW_NOTES);
	await needsReviewRow.getByRole("button", { name: "Resolve" }).click();
	// It returns to CURRENT: the "CHANGED — needs re-review" badge disappears.
	await expect(
		needsReviewRow.getByText("CHANGED — needs re-review"),
	).toHaveCount(0);

	// History now logs the full trail: the ORIGINAL DISPOSITIONED, the CHANGED
	// event from the profile edit, and the NEW DISPOSITIONED from this re-review
	// (so 2 DISPOSITIONED entries plus a CHANGED entry). Reload first so the
	// board remounts with a fresh (uncached) per-match history — the drawer
	// loads each match's audit trail lazily and caches it, so without a reload
	// an already-opened drawer would show the pre-re-disposition trail.
	await page.goto("/review");
	await page.reload();
	await expect(
		page.getByRole("heading", { name: "Review Board" }),
	).toBeVisible();
	await page.locator("#view-filter").selectOption("ALL");
	const reReviewedRow = page.locator("tbody tr", { hasText: CUSTOMER_REF });
	await expect(reReviewedRow).toBeVisible();
	await expect(
		reReviewedRow.getByText("CHANGED — needs re-review"),
	).toHaveCount(0);
	await reReviewedRow
		.getByRole("button", { name: `History for ${CUSTOMER_REF}` })
		.click();
	const reReviewHistory = page.locator("tbody tr:has(li)");
	await expect(
		reReviewHistory.locator("li", { hasText: "CHANGED" }),
	).toBeVisible();
	await expect(
		reReviewHistory.locator("li", { hasText: "DISPOSITIONED" }),
	).toHaveCount(2);
	await reReviewedRow
		.getByRole("button", { name: `History for ${CUSTOMER_REF}` })
		.click();

	// "Changed only" no longer lists the row (it is CURRENT now); "All" still does.
	await page.locator("#view-filter").selectOption("CHANGED");
	await expect(page.locator("tbody tr", { hasText: CUSTOMER_REF })).toHaveCount(
		0,
	);
	await page.locator("#view-filter").selectOption("ALL");
	await expect(
		page.locator("tbody tr", { hasText: CUSTOMER_REF }),
	).toBeVisible();

	// =======================================================================
	// 11 (Theme B / wave 2). Settings sensitivity → Apply → re-screen RAN →
	//     persists across a full reload (OPFS).
	//
	//   Change the global sensitivity from the current "Balanced" to "Lenient"
	//   and Apply. setScreeningConfig persists the config THEN re-screens every
	//   customer; because the config genuinely changed, the rescan summary
	//   banner reports a customer count (the "Re-screened N customers …" path,
	//   NOT the "Settings unchanged" no-op).
	// =======================================================================
	await page.goto("/settings");
	await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
	const sensitivity = page.getByRole("radiogroup", {
		name: "Screening sensitivity",
	});
	// Current value is the default "Balanced".
	await expect(
		sensitivity.getByRole("radio", { name: "Balanced" }),
	).toHaveAttribute("aria-checked", "true");
	await sensitivity.getByRole("radio", { name: "Lenient" }).click();
	await expect(
		sensitivity.getByRole("radio", { name: "Lenient" }),
	).toHaveAttribute("aria-checked", "true");
	await page.getByRole("button", { name: "Apply" }).click();
	// The re-screen actually ran (a customer count), not the no-op banner.
	const rescanBanner = page.getByText(/Re-screened \d+ customers/);
	await expect(rescanBanner).toBeVisible({ timeout: 120_000 });

	// The board still renders with the new threshold in effect (asserting an
	// exact match-count delta is brittle; assert the board loads post-rescan).
	await page.goto("/review");
	await expect(
		page.getByRole("heading", { name: "Review Board" }),
	).toBeVisible();
	await expect(
		page.locator("tbody tr", { hasText: CUSTOMER_REF }),
	).toBeVisible();

	// Full reload: settings (sensitivity) AND dispositions persisted to OPFS.
	await page.goto("/settings");
	await page.reload();
	await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
	const sensitivityAfterReload = page.getByRole("radiogroup", {
		name: "Screening sensitivity",
	});
	await expect(
		sensitivityAfterReload.getByRole("radio", { name: "Lenient" }),
	).toHaveAttribute("aria-checked", "true");

	await page.goto("/review");
	await page.reload();
	await expect(
		page.getByRole("heading", { name: "Review Board" }),
	).toBeVisible();
	const persistedRow = page.locator("tbody tr", { hasText: CUSTOMER_REF });
	await expect(persistedRow).toBeVisible();
	await expect(
		persistedRow.locator(".badge", { hasText: "FALSE_POSITIVE" }),
	).toBeVisible();
	// The re-review notes (the most recent disposition, §10) persisted to OPFS.
	await expect(persistedRow).toContainText(RE_REVIEW_NOTES);

	// =======================================================================
	// 12. Console hygiene: zero browser errors across the entire journey.
	// =======================================================================
	expect(
		consoleErrors,
		`browser console errors:\n${consoleErrors.join("\n")}`,
	).toEqual([]);
});
