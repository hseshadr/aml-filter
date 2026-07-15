// Bounded retry around opfs-sahpool acquisition.
//
// Why this exists (reproduced live on aml-filter.com): a full-page navigation
// between DB-backed routes tears down the outgoing page's DB worker, which
// releases its opfs-sahpool SyncAccessHandles ASYNCHRONOUSLY. The incoming
// page's worker races that release; losing throws NoModificationAllowedError
// ("Access Handles cannot be created…") on first paint even though the pool
// frees milliseconds later. That transient loss is indistinguishable from real
// multi-tab contention on a single attempt — but not over a short retry
// budget: navigation contention clears almost immediately, a second open tab
// holds the pool forever. So: retry contention-shaped failures with doubling
// backoff, and only surface the "already open in another tab?" banner once the
// budget exhausts. Non-contention failures (quota, corruption) fail fast.

/** Acquisition attempts before concluding real multi-tab contention. */
export const POOL_ACQUIRE_MAX_ATTEMPTS = 8;
/** First backoff wait; doubles per attempt up to the cap. */
export const POOL_ACQUIRE_INITIAL_DELAY_MS = 50;
/** Per-wait ceiling — the full budget stays ~3s (50+100+200+400+800×3). */
export const POOL_ACQUIRE_MAX_DELAY_MS = 800;

type Sleep = (ms: number) => Promise<void>;

const realSleep: Sleep = (ms) =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

// The raw DOMException name Chromium throws from createSyncAccessHandle when
// another holder still has the file, plus its message text so a wrapped
// rethrow (sqlite-wasm sometimes re-labels the error) still classifies.
const CONTENTION_NAME = "NoModificationAllowedError";
const CONTENTION_TEXT =
	/access handles? cannot be created|NoModificationAllowedError/i;

/** Is this open failure the transient handle-release race (vs quota/corruption)? */
export function isPoolContentionError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	return error.name === CONTENTION_NAME || CONTENTION_TEXT.test(error.message);
}

/** The pre-existing user-facing open-failure wrap — copy unchanged. */
function describeOpenFailure(error: unknown): Error {
	const detail = error instanceof Error ? error.message : String(error);
	return new Error(
		`could not open the local KYC database — is the workstation already open in another tab? (${detail})`,
	);
}

/**
 * Open the pool, absorbing the navigation handle-release race: contention
 * failures retry with doubling backoff up to the budget; anything else — and
 * contention that outlives the budget (a genuinely open second tab) — rejects
 * with the existing "already open in another tab?" message.
 */
export async function acquirePool<T>(
	open: () => Promise<T>,
	sleep: Sleep = realSleep,
): Promise<T> {
	let delayMs = POOL_ACQUIRE_INITIAL_DELAY_MS;
	for (let attempt = 1; ; attempt += 1) {
		try {
			return await open();
		} catch (error) {
			const retryable =
				isPoolContentionError(error) && attempt < POOL_ACQUIRE_MAX_ATTEMPTS;
			if (!retryable) {
				throw describeOpenFailure(error);
			}
			await sleep(delayMs);
			delayMs = Math.min(delayMs * 2, POOL_ACQUIRE_MAX_DELAY_MS);
		}
	}
}
