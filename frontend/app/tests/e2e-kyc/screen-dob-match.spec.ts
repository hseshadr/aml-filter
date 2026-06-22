import { expect, test } from "@playwright/test";

/**
 * e2e-kyc — the DOB-input reachability + dob_match regression guard, proven
 * END-TO-END in a real headless Chromium over the MINIFIED production build,
 * against the COMMITTED signed BUNDLE (app/public/bundle/origin) verified in-tab
 * against the pinned key (no application backend; the kyc build sets no
 * VITE_BUNDLE_BASE_URL, so the runtime boots over the default /bundle/origin).
 *
 * Until this slice, the parity-locked `dob_match` scorer was UNREACHABLE from
 * the UI: /screen had no date-of-birth input, so a query DOB never reached
 * `engine.screen({ dob })`. This guard drives the real /screen Date-of-birth
 * input with the known demo entity "Ivan Fakovich" (OFAC_SDN:0001) and its
 * published ISO DOB (1971-03-14), and asserts the dossier now surfaces the
 * exact-DOB-match reason the scorer emits ("Exact DOB match: 1971-03-14") — i.e.
 * the date input's YYYY-MM-DD value flowed through to the scored dob_match
 * signal. It also confirms a clean in-page console throughout.
 *
 * `http://localhost` is a secure context — REQUIRED for OPFS + WebCrypto
 * fail-closed verification; a LAN IP / host.docker.internal would fail
 * differently and does NOT count as validation (CLAUDE.md mandate).
 */

const MODEL_LOAD_TIMEOUT_MS = 160_000;
const RESULT_TIMEOUT_MS = 30_000;

// The known demo entity (OFAC_SDN:0001) and the ISO DOB the committed watchlist
// publishes for it. A query DOB equal to this must score an exact dob_match.
const DEMO_NAME = "Ivan Fakovich";
const DEMO_DOB_ISO = "1971-03-14";

test("entering a matching DOB on /screen surfaces the dob_match reason in the dossier", async ({
	page,
}) => {
	test.setTimeout(240_000);

	const errors: string[] = [];
	page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
	page.on("console", (msg) => {
		if (msg.type() === "error") {
			errors.push(`console.error: ${msg.text()}`);
		}
	});

	await page.goto("/screen", { waitUntil: "domcontentloaded" });
	await expect(page).toHaveTitle(/AML-Filter/i);

	const search = page.getByPlaceholder("Search a name, e.g. Ivan Fakovich");
	await expect(search).toBeVisible();
	// The box enabling proves the catalog verified and the ~23 MB model compiled.
	await expect(search).toBeEnabled({ timeout: MODEL_LOAD_TIMEOUT_MS });

	const alert = page.locator('[role="alert"]');
	if (await alert.count()) {
		throw new Error(`bootstrap errored: ${await alert.first().textContent()}`);
	}

	// The new optional Date-of-birth input must be present and a native date field.
	const dob = page.getByLabel(/date of birth/i);
	await expect(dob).toBeVisible();
	await expect(dob).toBeEnabled();

	// Enter the matching DOB FIRST, then the name; both feed the live search.
	await dob.fill(DEMO_DOB_ISO);
	await search.fill(DEMO_NAME);

	// The scored dossier for the demo entity (browse cards carry no score).
	const scoredCard = page
		.locator(".match-card:has(.match-card__score)")
		.first();
	await expect(scoredCard).toBeVisible({ timeout: RESULT_TIMEOUT_MS });
	await expect(scoredCard.locator(".match-card__name")).toHaveText(DEMO_NAME);

	// The load-bearing assertion: the parity-locked scorer's exact-DOB-match
	// reason is now rendered — i.e. the date input threaded its value into
	// engine.screen({ dob }) and produced a scored dob_match signal.
	await expect(scoredCard).toContainText(`Exact DOB match: ${DEMO_DOB_ISO}`);

	expect(errors, `in-browser errors:\n${errors.join("\n")}`).toEqual([]);
});
