import { expect, test } from "@playwright/test";

/**
 * signature-failure-copy — the real-Worker proof for the boot-error boundary.
 *
 * A bundle whose ed25519 signature does not verify is refused. That is the
 * product's central security claim. On 2026-08-01, live, it reported itself as:
 *
 *     "Local screening engine unavailable — Close another AML-Filter tab."
 *
 * Two defects stacked. `worker.ts` posted only `error.message` across
 * `postMessage`, so structured clone erased the fact that the failure was a
 * `SignatureError`; and the app's error registry had no `SignatureError` branch
 * to fire even if it had survived. A visitor whose bundle failed signature
 * verification was told to close a tab.
 *
 * Why this test is a BROWSER test and not a unit test: every unit test for that
 * registry hands it a freshly-constructed `new IntegrityError(...)` in-process,
 * where the type cannot be lost. `bundleSource.test.ts:86` says so in its own
 * comment — "An in-process BundleEngineClient mirroring worker.ts". The bug
 * lived exactly in the gap those tests are structurally unable to see: the
 * postMessage hop. Only a real dedicated Worker exercises it.
 *
 * The tamper is applied to the SIGNATURE alone, leaving the pointer otherwise
 * well-formed, so the failure is genuinely the ed25519 verify — not a parse
 * error wearing its clothes.
 *
 * PROVEN ABLE TO FAIL: against the pre-fix tree this run reports "Local
 * screening engine unavailable".
 */

const BOOT_FAILURE_TIMEOUT_MS = 60_000;

test("a bundle that fails signature verification says so", async ({
	page,
	context,
}) => {
	let tampered = 0;

	await context.route("**/bundle/origin/latest", async (route) => {
		const response = await route.fetch();
		const pointer = JSON.parse(await response.text()) as {
			signature: string;
			[key: string]: unknown;
		};
		// Flip one base64 character of the detached signature. Everything else —
		// manifest_hash, version, sequence, schema — stays byte-identical, so the
		// ONLY thing that can fail is the ed25519 verify.
		const original = pointer.signature;
		pointer.signature = `${original[0] === "A" ? "B" : "A"}${original.slice(1)}`;
		tampered += 1;
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(pointer),
		});
	});

	await page.goto("/screen");

	const alert = page.locator('[role="alert"]');
	await expect(alert).toBeVisible({ timeout: BOOT_FAILURE_TIMEOUT_MS });
	const text = (await alert.first().textContent()) ?? "";

	// The interception must actually have happened, or this test is vacuous.
	expect(tampered).toBeGreaterThan(0);

	// The claim: a signature failure reads as a verification failure.
	expect(text).toContain("verification failed");
	// And specifically NOT as a tab conflict — the exact live symptom.
	expect(text).not.toContain("Close another AML-Filter tab");
});
