/**
 * Cross-tab mutation serialization for the shared OPFS bundle store.
 *
 * Syncs hold a shared lifecycle lock while they stage verified CAS bytes, so
 * they may run concurrently. Clear takes the same lock exclusively, preventing
 * it from deleting a sync's staging bytes halfway through. The final active
 * pointer check + promotion uses a separate, short exclusive lock.
 */

export const STORE_LIFECYCLE_LOCK = "aml-filter:bundle-store:lifecycle";
export const STORE_PROMOTION_LOCK = "aml-filter:bundle-store:promotion";
export const DEFAULT_STORE_LOCK_TIMEOUT_MS = 10_000;

export interface WebLockManager {
	request<T>(
		name: string,
		options: LockOptions,
		callback: () => Promise<T>,
	): Promise<T>;
}

export class StoreLockTimeoutError extends Error {
	public readonly retryable = true;

	public constructor(lockName: string, timeoutMs: number) {
		super(
			`bundle store lock timed out after ${timeoutMs} ms (${lockName}); close stale tabs and retry`,
		);
		this.name = "StoreLockTimeoutError";
	}
}

export class StoreLockUnsupportedError extends Error {
	public constructor() {
		super(
			"this browser is missing Web Locks required for safe cross-tab bundle updates",
		);
		this.name = "StoreLockUnsupportedError";
	}
}

async function withBoundedLock<T>(
	locks: WebLockManager | undefined,
	name: string,
	mode: LockMode,
	operation: () => Promise<T>,
	timeoutMs: number,
): Promise<T> {
	if (locks === undefined) {
		throw new StoreLockUnsupportedError();
	}
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	let acquired = false;
	try {
		return await locks.request(
			name,
			{ mode, signal: controller.signal },
			() => {
				acquired = true;
				clearTimeout(timer);
				return operation();
			},
		);
	} catch (error) {
		if (!acquired && controller.signal.aborted) {
			throw new StoreLockTimeoutError(name, timeoutMs);
		}
		throw error;
	} finally {
		clearTimeout(timer);
	}
}

export function withSyncLifecycleLock<T>(
	locks: WebLockManager | undefined,
	operation: () => Promise<T>,
	timeoutMs = DEFAULT_STORE_LOCK_TIMEOUT_MS,
): Promise<T> {
	return withBoundedLock(
		locks,
		STORE_LIFECYCLE_LOCK,
		"shared",
		operation,
		timeoutMs,
	);
}

export function withClearLifecycleLock<T>(
	locks: WebLockManager | undefined,
	operation: () => Promise<T>,
	timeoutMs = DEFAULT_STORE_LOCK_TIMEOUT_MS,
): Promise<T> {
	return withBoundedLock(
		locks,
		STORE_LIFECYCLE_LOCK,
		"exclusive",
		operation,
		timeoutMs,
	);
}

export function withPromotionLock<T>(
	locks: WebLockManager | undefined,
	operation: () => Promise<T>,
	timeoutMs = DEFAULT_STORE_LOCK_TIMEOUT_MS,
): Promise<T> {
	return withBoundedLock(
		locks,
		STORE_PROMOTION_LOCK,
		"exclusive",
		operation,
		timeoutMs,
	);
}
