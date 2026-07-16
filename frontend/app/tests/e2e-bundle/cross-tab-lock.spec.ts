import { expect, test } from "@playwright/test";

const LOCK_NAME = "aml-filter:bundle-store:lifecycle";

interface LockProbe extends Window {
	__releaseBundleLock?: () => void;
	__bundleLockHeld?: boolean;
	__exclusiveEntered?: boolean;
}

test("real Chromium serializes the bundle lifecycle lock across two tabs", async ({
	context,
	page,
}) => {
	await page.goto("/", { waitUntil: "domcontentloaded" });
	const secondTab = await context.newPage();
	await secondTab.goto("/", { waitUntil: "domcontentloaded" });

	await page.evaluate((name) => {
		const probe = window as LockProbe;
		void navigator.locks.request(name, { mode: "shared" }, async () => {
			probe.__bundleLockHeld = true;
			await new Promise<void>((resolve) => {
				probe.__releaseBundleLock = resolve;
			});
		});
	}, LOCK_NAME);
	await expect
		.poll(() => page.evaluate(() => (window as LockProbe).__bundleLockHeld))
		.toBe(true);

	await secondTab.evaluate((name) => {
		const probe = window as LockProbe;
		probe.__exclusiveEntered = false;
		void navigator.locks.request(name, { mode: "exclusive" }, async () => {
			probe.__exclusiveEntered = true;
		});
	}, LOCK_NAME);
	await expect
		.poll(() =>
			secondTab.evaluate(async (name) => {
				const snapshot = await navigator.locks.query();
				return snapshot.pending?.some((lock) => lock.name === name) ?? false;
			}, LOCK_NAME),
		)
		.toBe(true);
	expect(
		await secondTab.evaluate(() => (window as LockProbe).__exclusiveEntered),
	).toBe(false);

	await page.evaluate(() => (window as LockProbe).__releaseBundleLock?.());
	await expect
		.poll(() =>
			secondTab.evaluate(() => (window as LockProbe).__exclusiveEntered),
		)
		.toBe(true);
	await secondTab.close();
});
