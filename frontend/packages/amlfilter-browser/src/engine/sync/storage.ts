// Storage-quota preflight + mid-sync quota handling for the delta-sync. iOS
// Safari (and any browser under storage pressure) can refuse an OPFS write once
// the origin's quota is exhausted. Without a preflight the sync fetches tens of
// MB before the FIRST write throws deep in a Worker; with one we can refuse
// early and explain. Either way a QuotaExceededError mid-write becomes a typed,
// user-explained QuotaError instead of a raw DOMException string.
//
// Maps to the future canonical `bundle.quota_exceeded` error code (self-
// contained here — no dependency on a shared errors library).

/** A browser storage quota estimate — the fields `navigator.storage.estimate()`
 * returns, each optional because not every browser reports them. */
export interface StorageEstimateLike {
	readonly quota?: number;
	readonly usage?: number;
}

/** The injectable storage-estimate seam. Production wires
 * `navigator.storage.estimate`; tests pass a fake. */
export type EstimateStorage = () => Promise<StorageEstimateLike>;

/** Not enough device storage to hold the synced bundle (fail-fast, not a hang).
 * Maps to the future canonical `bundle.quota_exceeded` code. */
export class QuotaError extends Error {
	public constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "QuotaError";
	}
}

/**
 * Whether the reported free space (`quota - usage`) can hold `neededBytes`. Pure.
 * BEST-EFFORT: when the browser can't report both numbers the preflight must not
 * block a sync that might well succeed — the OPFS write still fails closed with a
 * real QuotaExceededError if space actually runs out mid-sync.
 */
export function fitsInQuota(
	estimate: StorageEstimateLike,
	neededBytes: number,
): boolean {
	const { quota, usage } = estimate;
	if (typeof quota !== "number" || typeof usage !== "number") {
		return true;
	}
	return quota - usage >= neededBytes;
}

/** True for the DOMException a browser throws when a storage write exceeds the
 * origin quota — modern (`QuotaExceededError`) and legacy Firefox
 * (`NS_ERROR_DOM_QUOTA_REACHED`). */
export function isQuotaExceeded(error: unknown): boolean {
	return (
		error instanceof DOMException &&
		(error.name === "QuotaExceededError" ||
			error.name === "NS_ERROR_DOM_QUOTA_REACHED")
	);
}
