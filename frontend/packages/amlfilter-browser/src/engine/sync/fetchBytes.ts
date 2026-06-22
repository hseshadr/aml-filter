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

export const fetchBytes: FetchBytes = async (url, options) => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	let response: Response;
	try {
		response = await fetch(url, fetchInit(controller.signal, options));
	} catch (cause) {
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
	if (!response.ok) {
		throw new NetworkError(
			`fetch ${url} failed: ${response.status} ${response.statusText}`,
		);
	}
	return new Uint8Array(await response.arrayBuffer());
};
