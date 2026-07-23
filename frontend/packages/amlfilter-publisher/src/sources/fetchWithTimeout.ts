/** Default upper bound for an external sanctions-feed request. */
export const SOURCE_FETCH_TIMEOUT_MS = 45_000;

/** Fetch one external feed without allowing a stalled upstream to hang a release. */
export async function fetchWithTimeout(
	url: string,
	label: string,
	timeoutMs: number = SOURCE_FETCH_TIMEOUT_MS,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { signal: controller.signal });
	} catch (error) {
		if (controller.signal.aborted) {
			throw new Error(`${label} request timed out after ${timeoutMs}ms`, {
				cause: error,
			});
		}
		throw error;
	} finally {
		clearTimeout(timer);
	}
}
