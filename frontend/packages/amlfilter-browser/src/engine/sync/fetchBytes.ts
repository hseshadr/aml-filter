// The transport seam: fetch raw bytes for a URL. Injectable so tests back the
// sync engine with the real examples/catalog files instead of the network.

import type { FetchBytes, FetchBytesOptions } from "./types";

/**
 * The transport could not reach the origin: offline, DNS failure, or a server
 * status that signals unreachability rather than a tampered response. This is
 * the ONLY failure class `syncIndex` is allowed to recover from by serving the
 * cached active version — integrity/signature failures must always propagate.
 */
export class NetworkError extends Error {
	public constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "NetworkError";
	}
}

/**
 * Hard ceiling on a single transport fetch. A stalled origin (no FIN, no RST)
 * would otherwise leave the await pending forever; the AbortController turns
 * that into a NetworkError so `syncIndex` fails closed instead of hanging.
 */
export const FETCH_TIMEOUT_MS = 15_000;
/** All bundle transport objects are pointer/manifest/key metadata or FastCDC
 * chunks. One MiB leaves ample headroom over the producer's 256 KiB max chunk
 * while bounding hostile Content-Length and chunked responses. */
export const MAX_FETCH_BYTES = 1024 * 1024;

/** A response exceeded the authenticated bundle transport envelope. Unlike an
 * unreachable origin this must not fall back to stale cached data. */
export class FetchLimitError extends Error {
	public constructor(url: string, bytes: number) {
		super(
			`fetch ${url} exceeded the ${MAX_FETCH_BYTES}-byte limit (${bytes} bytes)`,
		);
		this.name = "FetchLimitError";
	}
}

/** Build the `RequestInit`, threading the abort signal and any cache mode. The
 * `cache` key is set ONLY when requested so a default fetch leaves it absent. */
function fetchInit(
	signal: AbortSignal,
	options?: FetchBytesOptions,
): RequestInit {
	if (options?.cache === undefined) {
		return { signal };
	}
	return { signal, cache: options.cache };
}

function declaredLength(response: Response): number | null {
	const raw = response.headers.get("Content-Length");
	if (raw === null || !/^\d+$/.test(raw)) {
		return null;
	}
	const parsed = Number(raw);
	return Number.isSafeInteger(parsed) ? parsed : null;
}

function concatenate(
	parts: ReadonlyArray<Uint8Array>,
	total: number,
): Uint8Array {
	const result = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.byteLength;
	}
	return result;
}

async function readBoundedBody(
	response: Response,
	url: string,
): Promise<Uint8Array> {
	const expected = declaredLength(response);
	if (expected !== null && expected > MAX_FETCH_BYTES) {
		throw new FetchLimitError(url, expected);
	}
	if (response.body === null) {
		if (expected === 0) return new Uint8Array();
		throw new NetworkError(`fetch ${url} failed: response body unavailable`);
	}
	const reader = response.body.getReader();
	const parts: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MAX_FETCH_BYTES) {
				void reader.cancel().catch(() => undefined);
				throw new FetchLimitError(url, total);
			}
			parts.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	return concatenate(parts, total);
}

export const fetchBytes: FetchBytes = async (url, options) => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const response = await fetch(url, fetchInit(controller.signal, options));
		if (!response.ok) {
			throw new NetworkError(
				`fetch ${url} failed: ${response.status} ${response.statusText}`,
			);
		}
		return await readBoundedBody(response, url);
	} catch (cause) {
		if (cause instanceof NetworkError || cause instanceof FetchLimitError) {
			throw cause;
		}
		if (controller.signal.aborted) {
			// The abort fired: the request exceeded FETCH_TIMEOUT_MS. Surface it as
			// the same recoverable NetworkError class so syncIndex's fail-closed
			// fallback treats a stall like any other unreachable origin.
			throw new NetworkError(
				`fetch ${url} failed: timed out after ${FETCH_TIMEOUT_MS}ms`,
				{ cause },
			);
		}
		// `fetch` rejects on a network-level failure (offline, DNS, CORS).
		throw new NetworkError(`fetch ${url} failed: network unreachable`, {
			cause,
		});
	} finally {
		clearTimeout(timer);
	}
};
