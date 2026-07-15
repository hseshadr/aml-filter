// Unit contract for the pool-acquisition retry wrapper (acquire.ts).
//
// The failure it guards against (reproduced live on aml-filter.com): on a
// full-page navigation between DB-backed routes, the outgoing page's worker
// releases its opfs-sahpool SyncAccessHandles ASYNCHRONOUSLY while the new
// page's worker races to acquire them. Losing that race throws
// NoModificationAllowedError ("Access Handles cannot be created…"), which is
// transient — a retry moments later succeeds. Real multi-tab contention is the
// SAME error persisting past the whole retry budget.
//
// Tests inject a fake opener + fake sleep (no real OPFS, no real waiting),
// mirroring the package seam split: worker-side logic is unit-tested against
// fakes, sqlite.ts stays the thin facade.

import { describe, expect, it } from "vitest";
import {
	acquirePool,
	isPoolContentionError,
	POOL_ACQUIRE_INITIAL_DELAY_MS,
	POOL_ACQUIRE_MAX_ATTEMPTS,
	POOL_ACQUIRE_MAX_DELAY_MS,
} from "./acquire";

/** The exact shape Chromium rejects with when the outgoing page still holds a handle. */
function contentionError(): Error {
	const error = new Error(
		"Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': " +
			"Access Handles cannot be created if there is another open Access Handle " +
			"or Writable stream associated with the same file.",
	);
	error.name = "NoModificationAllowedError";
	return error;
}

function recordingSleep(delays: number[]): (ms: number) => Promise<void> {
	return (ms) => {
		delays.push(ms);
		return Promise.resolve();
	};
}

describe("acquirePool", () => {
	it("retries through handle contention and resolves once the pool frees", async () => {
		let attempts = 0;
		const open = (): Promise<string> => {
			attempts += 1;
			return attempts < 3
				? Promise.reject(contentionError())
				: Promise.resolve("db");
		};
		const delays: number[] = [];
		await expect(acquirePool(open, recordingSleep(delays))).resolves.toBe("db");
		expect(attempts).toBe(3);
		// Backoff doubles from the initial delay between attempts.
		expect(delays).toEqual([
			POOL_ACQUIRE_INITIAL_DELAY_MS,
			POOL_ACQUIRE_INITIAL_DELAY_MS * 2,
		]);
	});

	it("surfaces the another-tab message only after the retry budget exhausts", async () => {
		let attempts = 0;
		const open = (): Promise<string> => {
			attempts += 1;
			return Promise.reject(contentionError());
		};
		const delays: number[] = [];
		const failure = await acquirePool(open, recordingSleep(delays)).then(
			() => null,
			(error: unknown) => error,
		);
		expect(failure).toBeInstanceOf(Error);
		// Persisting contention IS the real "already open in another tab" case —
		// the existing banner copy survives unchanged, with the raw detail kept.
		expect((failure as Error).message).toMatch(
			/could not open the local KYC database — is the workstation already open in another tab\?/,
		);
		expect((failure as Error).message).toMatch(
			/Access Handles cannot be created/,
		);
		expect(attempts).toBe(POOL_ACQUIRE_MAX_ATTEMPTS);
		expect(delays).toHaveLength(POOL_ACQUIRE_MAX_ATTEMPTS - 1);
		// The budget is short and bounded: capped per-wait, ~3s overall — a banner
		// after a hang would be worse than the banner itself.
		expect(Math.max(...delays)).toBeLessThanOrEqual(POOL_ACQUIRE_MAX_DELAY_MS);
		const total = delays.reduce((sum, ms) => sum + ms, 0);
		expect(total).toBeLessThanOrEqual(4000);
	});

	it("fails fast on a non-contention error: one attempt, zero waits", async () => {
		let attempts = 0;
		const quota = new Error("storage quota exceeded");
		quota.name = "QuotaExceededError";
		const open = (): Promise<string> => {
			attempts += 1;
			return Promise.reject(quota);
		};
		const delays: number[] = [];
		const failure = await acquirePool(open, recordingSleep(delays)).then(
			() => null,
			(error: unknown) => error,
		);
		expect(failure).toBeInstanceOf(Error);
		// Same user-facing wrap as before this fix (behavior parity for the app),
		// but reached immediately — quota/corruption must not burn the budget.
		expect((failure as Error).message).toMatch(
			/could not open the local KYC database/,
		);
		expect((failure as Error).message).toMatch(/storage quota exceeded/);
		expect(attempts).toBe(1);
		expect(delays).toEqual([]);
	});

	it("waits for real (default) sleep between attempts", async () => {
		// Covers the default timer path: one contention failure, then success.
		let attempts = 0;
		const open = (): Promise<string> => {
			attempts += 1;
			return attempts === 1
				? Promise.reject(contentionError())
				: Promise.resolve("db");
		};
		await expect(acquirePool(open)).resolves.toBe("db");
		expect(attempts).toBe(2);
	});
});

describe("isPoolContentionError", () => {
	it("classifies the raw DOMException by name", () => {
		expect(isPoolContentionError(contentionError())).toBe(true);
	});

	it("classifies a wrapped error by its message text", () => {
		expect(
			isPoolContentionError(
				new Error(
					"GetSyncHandleError: NoModificationAllowedError: Access Handles cannot be created",
				),
			),
		).toBe(true);
	});

	it("rejects non-contention errors and non-Error values", () => {
		const quota = new Error("quota exceeded");
		quota.name = "QuotaExceededError";
		expect(isPoolContentionError(quota)).toBe(false);
		expect(isPoolContentionError("boom")).toBe(false);
		expect(isPoolContentionError(null)).toBe(false);
	});
});
