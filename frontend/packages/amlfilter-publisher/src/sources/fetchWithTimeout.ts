// The single seam every sanctions-feed request goes through (OFAC, UN, EU, UK).
//
// It does three things a bare `fetch(url)` does not:
//   1. IDENTIFIES US. A bare fetch sends no User-Agent, which public feeds
//      increasingly treat as scraper traffic. On 2026-07-30 Treasury put the
//      OFAC sanctions-list service behind an AWS WAF and every UA-less request
//      started returning 403 — which killed every deploy. Announcing who we are
//      with a contactable URL is the baseline these publishers expect.
//   2. RETRIES TRANSIENTLY. A single 429/503/connection-reset from an upstream
//      must not be a one-shot kill for a release, so those get a small number of
//      attempts with growing backoff. A permanent answer (404, 400) is NOT
//      retried — burning the budget on it only delays the real error.
//   3. NAMES A WAF BLOCK FOR WHAT IT IS. AWS WAF's `challenge` action answers
//      HTTP **202 with an empty body** — `response.ok` is TRUE. Passed through,
//      that hands zero bytes to a CSV parser and surfaces thousands of lines
//      later as "entity count 0 is outside plausible range". Detecting
//      `x-amzn-waf-action` here turns a baffling downstream failure into the
//      actual sentence: an edge WAF stopped us.
//
// Deliberately NOT retried: our own deadline. `SOURCE_FETCH_TIMEOUT_MS` is
// already a generous per-request bound, and re-arming it would triple the worst
// case this function exists to cap. Connection-level errors still retry.

/** Default upper bound for an external sanctions-feed request. */
export const SOURCE_FETCH_TIMEOUT_MS = 45_000;

/** Total attempts (1 initial + retries) for a transiently-failing feed. */
export const FEED_FETCH_ATTEMPTS = 3;

/** First backoff pause; each further retry doubles it. */
const BACKOFF_BASE_MS = 1_000;

/** How this publisher identifies itself to every upstream sanctions feed.
 * Overridable via SOURCE_USER_AGENT so an operator can adjust it without a code
 * change if an upstream's bot policy shifts again. */
export const FEED_USER_AGENT =
	process.env.SOURCE_USER_AGENT ??
	`aml-filter/${process.env.npm_package_version ?? "4"} (+https://aml-filter.com)`;

/** A feed request that could not be completed, and whether retrying may help. */
export class FeedFetchError extends Error {
	public readonly retryable: boolean;

	public constructor(
		message: string,
		retryable: boolean,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "FeedFetchError";
		this.retryable = retryable;
	}
}

/** Injection points so retry behaviour is testable without real waiting. */
export interface FeedFetchOptions {
	readonly attempts?: number;
	readonly sleep?: (ms: number) => Promise<void>;
	/** Extra request headers (e.g. an upstream's API key). Never logged. */
	readonly headers?: Readonly<Record<string, string>>;
}

const defaultSleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/** Statuses worth another attempt: rate limits, edge blocks, server faults. */
function isRetryableStatus(status: number): boolean {
	return (
		status === 403 ||
		status === 408 ||
		status === 425 ||
		status === 429 ||
		status >= 500
	);
}

/** Why this response is unusable, or null when it is a genuine payload. */
function rejectionReason(response: Response, label: string): string | null {
	const waf = response.headers.get("x-amzn-waf-action");
	if (waf !== null) {
		return `${label} request was stopped by an edge WAF (x-amzn-waf-action: ${waf}, HTTP ${response.status}) — this challenge cannot be solved by a plain HTTP client`;
	}
	if (!response.ok) {
		return `${label} request failed: ${response.status} ${response.statusText}`;
	}
	return null;
}

/** One bounded attempt. Throws FeedFetchError; never returns a bad response. */
async function attemptOnce(
	url: string,
	label: string,
	timeoutMs: number,
	extraHeaders: Readonly<Record<string, string>> = {},
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, {
			signal: controller.signal,
			headers: {
				"user-agent": FEED_USER_AGENT,
				accept: "*/*",
				...extraHeaders,
			},
		});
	} catch (error) {
		if (controller.signal.aborted) {
			// Our own deadline — see the header note on why this is terminal.
			throw new FeedFetchError(
				`${label} request timed out after ${timeoutMs}ms`,
				false,
				{ cause: error },
			);
		}
		throw new FeedFetchError(
			`${label} request failed: ${String(error)}`,
			true,
			{ cause: error },
		);
	} finally {
		clearTimeout(timer);
	}
}

/** Run one attempt and classify the outcome. */
async function classifyAttempt(
	url: string,
	label: string,
	timeoutMs: number,
	extraHeaders: Readonly<Record<string, string>>,
): Promise<Response | FeedFetchError> {
	try {
		const response = await attemptOnce(url, label, timeoutMs, extraHeaders);
		const reason = rejectionReason(response, label);
		if (reason === null) {
			return response;
		}
		return new FeedFetchError(reason, isRetryableStatus(response.status));
	} catch (error) {
		return error instanceof FeedFetchError
			? error
			: new FeedFetchError(`${label} request failed: ${String(error)}`, true, {
					cause: error,
				});
	}
}

/** Fetch one external feed: identified, bounded, and retried when it can help. */
export async function fetchWithTimeout(
	url: string,
	label: string,
	timeoutMs: number = SOURCE_FETCH_TIMEOUT_MS,
	options: FeedFetchOptions = {},
): Promise<Response> {
	const attempts = options.attempts ?? FEED_FETCH_ATTEMPTS;
	const sleep = options.sleep ?? defaultSleep;
	let failure = new FeedFetchError(
		`${label} request was never attempted`,
		false,
	);
	for (let attempt = 1; attempt <= attempts; attempt++) {
		if (attempt > 1) {
			await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 2));
		}
		const outcome = await classifyAttempt(
			url,
			label,
			timeoutMs,
			options.headers ?? {},
		);
		if (outcome instanceof FeedFetchError) {
			failure = outcome;
			if (!outcome.retryable) {
				break;
			}
		} else {
			return outcome;
		}
	}
	throw failure;
}
