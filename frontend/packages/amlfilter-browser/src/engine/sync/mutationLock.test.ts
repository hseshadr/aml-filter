import { describe, expect, it } from "vitest";
import {
	STORE_LIFECYCLE_LOCK,
	STORE_PROMOTION_LOCK,
	StoreLockTimeoutError,
	StoreLockUnsupportedError,
	type WebLockManager,
	withClearLifecycleLock,
	withPromotionLock,
	withSyncLifecycleLock,
} from "./mutationLock";

function deferred(): {
	readonly promise: Promise<void>;
	readonly resolve: () => void;
} {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

/** The one shared + one exclusive overlap needed to prove clear-vs-sync order. */
class LifecycleLockManager implements WebLockManager {
	#sharedActive = false;
	#exclusiveStart: (() => void) | undefined;

	public request<T>(
		_name: string,
		options: LockOptions,
		callback: () => Promise<T>,
	): Promise<T> {
		if (options.mode === "shared") {
			this.#sharedActive = true;
			return callback().finally(() => {
				this.#sharedActive = false;
				this.#exclusiveStart?.();
			});
		}
		return new Promise<T>((resolve, reject) => {
			const start = () => {
				this.#exclusiveStart = undefined;
				callback().then(resolve, reject);
			};
			if (this.#sharedActive) {
				this.#exclusiveStart = start;
			} else {
				start();
			}
		});
	}
}

describe("store mutation locks", () => {
	it("lets sync finish before a racing clear enters its exclusive section", async () => {
		const locks = new LifecycleLockManager();
		const syncRelease = deferred();
		const order: string[] = [];
		const sync = withSyncLifecycleLock(locks, async () => {
			order.push("sync-start");
			await syncRelease.promise;
			order.push("sync-end");
		});
		const clear = withClearLifecycleLock(locks, async () => {
			order.push("clear");
		});

		await Promise.resolve();
		expect(order).toEqual(["sync-start"]);
		syncRelease.resolve();
		await Promise.all([sync, clear]);
		expect(order).toEqual(["sync-start", "sync-end", "clear"]);
	});

	it("uses a distinct short exclusive lock for the final promotion", async () => {
		const requests: Array<{ readonly name: string; readonly mode?: LockMode }> =
			[];
		const locks: WebLockManager = {
			request: async <T>(
				name: string,
				options: LockOptions,
				callback: () => Promise<T>,
			): Promise<T> => {
				requests.push({ name, mode: options.mode });
				return callback();
			},
		};
		await withSyncLifecycleLock(locks, async () => undefined);
		await withClearLifecycleLock(locks, async () => undefined);
		await withPromotionLock(locks, async () => undefined);

		expect(requests).toEqual([
			{ name: STORE_LIFECYCLE_LOCK, mode: "shared" },
			{ name: STORE_LIFECYCLE_LOCK, mode: "exclusive" },
			{ name: STORE_PROMOTION_LOCK, mode: "exclusive" },
		]);
	});

	it("aborts a stalled acquisition within the budget with a typed retryable error", async () => {
		const locks: WebLockManager = {
			request: (_name, options) =>
				new Promise((_resolve, reject) => {
					options.signal?.addEventListener("abort", () => {
						reject(options.signal?.reason);
					});
				}),
		};
		const error = await withPromotionLock(locks, async () => "never", 5).catch(
			(caught: unknown) => caught,
		);

		expect(error).toBeInstanceOf(StoreLockTimeoutError);
		expect((error as StoreLockTimeoutError).retryable).toBe(true);
	});

	it("releases the browser lock when the protected operation rejects", async () => {
		const callbacks: Array<() => Promise<unknown>> = [];
		const locks: WebLockManager = {
			request: async <T>(
				_name: string,
				_options: LockOptions,
				callback: () => Promise<T>,
			): Promise<T> => {
				callbacks.push(callback);
				return callback();
			},
		};
		await expect(
			withPromotionLock(locks, async () => {
				throw new Error("tab operation crashed");
			}),
		).rejects.toThrow("tab operation crashed");
		await expect(
			withPromotionLock(locks, async () => "recovered"),
		).resolves.toBe("recovered");
		expect(callbacks).toHaveLength(2);
	});

	it("does not misclassify an operation failure after acquisition as a lock timeout", async () => {
		const locks: WebLockManager = {
			request: (_name, _options, callback) => callback(),
		};
		await expect(
			withPromotionLock(
				locks,
				async () => {
					await new Promise((resolve) => setTimeout(resolve, 5));
					throw new Error("verified write failed");
				},
				1,
			),
		).rejects.toThrow("verified write failed");
	});

	it("fails closed with a typed error when Web Locks is unavailable", async () => {
		const error = await withSyncLifecycleLock(
			undefined,
			async () => "unsafe",
		).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(StoreLockUnsupportedError);
		expect((error as Error).message).toMatch(/Web Locks/i);
	});
});
