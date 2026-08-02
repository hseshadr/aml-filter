// The model load must be bounded by SILENCE, not by elapsed time.
//
// The cold boot downloads a ~23 MB ONNX model and bounded it with
// `withTimeout(embed(WARMUP), 120_000)` — a wall clock. 23 MB in 120 s is about
// 1.6 Mbps, so every visitor slower than that got a Retry banner for a download
// that was working fine. Measured live: a sub-3 Mbps link failed the boot at
// 356 s, with the model as the remaining cause.
//
// Same bug class as the sync ceiling fixed in 52c96fb. The bound has to key on
// the GAP between progress ticks, not on their sum.
//
// The first two cases are the regression: one asserts a slow-but-moving load
// survives far past the old ceiling, the other asserts a genuine stall is still
// caught promptly. Both are needed — a bound that never fires is not a fix.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startIdleTimer, withIdleTimeout } from "./idleTimeout";
import {
	BOOT_TIMEOUT_MS,
	MODEL_LOAD_IDLE_TIMEOUT_MS,
	modelLoadIdleTimeoutMs,
} from "./runtime";

describe("withIdleTimeout", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("does NOT reject work that keeps reporting progress, however long it takes", async () => {
		let settle: (value: string) => void = () => undefined;
		const work = new Promise<string>((resolve) => {
			settle = resolve;
		});
		const bounded = withIdleTimeout(work, 90_000, "stalled");

		// Ten idle windows' worth of elapsed time, with a tick every 60 s — the
		// shape of a 23 MB download on a genuinely slow link. Under the old
		// wall-clock bound this rejected at 120 s.
		for (let index = 0; index < 10; index += 1) {
			await vi.advanceTimersByTimeAsync(60_000);
			bounded.tick();
		}
		settle("embedded");

		await expect(bounded.promise).resolves.toBe("embedded");
	});

	it("rejects work that has genuinely gone silent, within one window", async () => {
		const bounded = withIdleTimeout(
			new Promise<string>(() => undefined),
			90_000,
			"loading the name-matching model stalled",
		);
		const assertion = expect(bounded.promise).rejects.toThrow(
			"loading the name-matching model stalled",
		);

		await vi.advanceTimersByTimeAsync(90_000);

		await assertion;
	});

	it("does not reject just under the window", async () => {
		const bounded = withIdleTimeout(
			new Promise<string>(() => undefined),
			90_000,
			"stalled",
		);
		let rejected = false;
		bounded.promise.catch(() => {
			rejected = true;
		});

		await vi.advanceTimersByTimeAsync(89_999);

		expect(rejected).toBe(false);
	});

	it("stops the timer once the work settles, leaving no late rejection", async () => {
		const bounded = withIdleTimeout(Promise.resolve("done"), 90_000, "stalled");
		await expect(bounded.promise).resolves.toBe("done");

		// A stray timer firing after settlement would surface as an unhandled
		// rejection in the visitor's console.
		await vi.advanceTimersByTimeAsync(500_000);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("reports an expiry at most once", async () => {
		let expiries = 0;
		const timer = startIdleTimer(1_000, () => {
			expiries += 1;
		});

		await vi.advanceTimersByTimeAsync(5_000);
		timer.tick();
		await vi.advanceTimersByTimeAsync(5_000);

		expect(expiries).toBe(1);
	});

	it("never fires after cancel", async () => {
		let expiries = 0;
		const timer = startIdleTimer(1_000, () => {
			expiries += 1;
		});
		timer.cancel();

		await vi.advanceTimersByTimeAsync(5_000);

		expect(expiries).toBe(0);
	});
});

describe("the model-load bound the runtime applies", () => {
	it("is an IDLE window wide enough to cover the silent ONNX compile", () => {
		// Nothing emits progress while ORT compiles the graph after the last byte
		// arrives, so that silent stretch — not the download — is what sets the
		// floor. Measured at ~6 s on this hardware; the window keeps an order of
		// magnitude of headroom for a cold, throttled, or low-core device.
		expect(MODEL_LOAD_IDLE_TIMEOUT_MS).toBe(90_000);
	});

	it("catches a genuine stall FASTER than the 120 s wall clock it replaced", () => {
		// The new bound must not be a regression for the failure it still HAS to
		// detect. A visitor whose model download truly dies now waits 90 s, not
		// 120 s — the change is strictly better on both sides.
		const REPLACED_WALL_CLOCK_MS = 120_000;
		expect(MODEL_LOAD_IDLE_TIMEOUT_MS).toBeLessThan(REPLACED_WALL_CLOCK_MS);
	});

	it("stays well under the whole-boot backstop", () => {
		// The backstop must never be the thing that fires first, or the specific
		// diagnosis is replaced by a generic one.
		expect(MODEL_LOAD_IDLE_TIMEOUT_MS).toBeLessThan(BOOT_TIMEOUT_MS);
	});

	it("parses its env override fail-closed", () => {
		expect(modelLoadIdleTimeoutMs({})).toBe(MODEL_LOAD_IDLE_TIMEOUT_MS);
		expect(
			modelLoadIdleTimeoutMs({ VITE_MODEL_LOAD_IDLE_TIMEOUT_MS: "5000" }),
		).toBe(5_000);
		// A malformed override must never weaken the ceiling to 0/NaN.
		for (const raw of ["0", "-1", "abc", "", "NaN", "Infinity"]) {
			expect(
				modelLoadIdleTimeoutMs({ VITE_MODEL_LOAD_IDLE_TIMEOUT_MS: raw }),
			).toBe(MODEL_LOAD_IDLE_TIMEOUT_MS);
		}
	});
});
