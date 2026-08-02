import { expect, type Route, test } from "@playwright/test";

/**
 * boot-ceiling — the guard that the overall boot deadline actually BINDS.
 *
 * There are three bounds on a cold boot, and only one of them can catch a boot
 * that is moving but never arriving:
 *
 *   1. FETCH_TIMEOUT_MS   (15 s)  — one transport fetch hangs.
 *   2. no-progress watchdog (30 s) — no `sync-progress` tick from the Worker.
 *      RE-ARMED by every tick, deliberately: a slow-but-moving download must
 *      never be killed for being slow.
 *   3. the boot ceiling (`bootTimeoutMs`, wired through `withTimeout` in
 *      EngineRuntime.bootstrap) — total wall clock.
 *
 * A test that simply stalls the network proves nothing about (3): bound (2)
 * fires at 30 s and the assertion still goes green, which is how a broken
 * ceiling could sit here looking guarded. So this test keeps a tick landing
 * every fake-20s — permanently re-arming (2) — and requires the boot to be
 * terminated anyway. The only bound that can do that is (3).
 *
 * HOW THE CLOCK WORKS. `page.clock` fakes the MAIN thread only; the sync Worker
 * keeps real time. That is exactly the split this needs: (2) and (3) are
 * main-thread timers and are driven by the fake clock, while each held chunk is
 * released and completes in real milliseconds, so the Worker's real 15 s
 * per-fetch ceiling (1) never trips.
 *
 * Proven able to fail: drop the `withTimeout(...)` wrapper in
 * EngineRuntime.bootstrap and this run ends with no banner at all.
 */

/** Set by playwright.bundle.config.ts; see the comment there for why it differs
 * from the 900s production value, which unit tests pin instead. */
const BOOT_CEILING_MS = 200_000;
const TICK_MS = 20_000;

test("a slow-but-moving sync is still bounded by the boot ceiling", async ({
	page,
	context,
}) => {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));

	// Hold every chunk; the test releases them one at a time so it — not the
	// network — decides when the next proof-of-life reaches the main thread.
	const held: Array<() => void> = [];
	let released = 0;
	await context.route("**/bundle/origin/chunk/**", async (route: Route) => {
		await new Promise<void>((resolve) => held.push(resolve));
		released += 1;
		await route.continue();
	});

	await page.clock.install();
	await page.goto("/screen");
	// Real time for the Worker to spawn and get the signed pointer + manifest.
	await new Promise((resolve) => setTimeout(resolve, 2_000));

	const alert = page.locator("[role='alert']");
	let firedAtMs = -1;
	let elapsedMs = 0;
	// One tick past the ceiling is all this may take; anything more would mean
	// the ceiling did not bind.
	const maxTicks = Math.ceil(BOOT_CEILING_MS / TICK_MS) + 1;
	for (let tick = 0; tick < maxTicks; tick += 1) {
		// Proof of life: one more verified chunk lands, re-arming the 30s watchdog.
		held.shift()?.();
		await new Promise((resolve) => setTimeout(resolve, 700));
		await page.clock.runFor(TICK_MS);
		elapsedMs += TICK_MS;
		await new Promise((resolve) => setTimeout(resolve, 200));
		if ((await alert.count()) > 0) {
			firedAtMs = elapsedMs;
			break;
		}
	}

	// The ceiling bound the boot, at the ceiling — not early, not never.
	expect(firedAtMs).toBe(BOOT_CEILING_MS);
	// And it was bound by the CEILING, not by the no-progress watchdog. Without
	// this the test would pass on a stall, proving nothing about the ceiling.
	await expect(alert.first()).toContainText(
		`loading the screening engine timed out after ${BOOT_CEILING_MS}ms`,
	);
	// The sync really was progressing the whole time — the watchdog had a live
	// reason to stay re-armed rather than simply never having been wired up.
	expect(released).toBeGreaterThanOrEqual(BOOT_CEILING_MS / TICK_MS - 1);
	// A bounded boot is a handled failure, not a crash.
	expect(pageErrors).toEqual([]);
});
