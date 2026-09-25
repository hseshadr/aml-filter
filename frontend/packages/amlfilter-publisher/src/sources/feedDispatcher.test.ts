import { createServer, type Server } from "node:http";
import type { AddressInfo, LookupFunction } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createFeedDispatcher,
	FEED_DISPATCHER,
	fetchWithTimeout,
} from "./fetchWithTimeout.ts";

// 2026-09-24 root cause of the 24-day-stale UK list. `sanctionslist.fcdo.gov.uk`
// is a delegated zone whose Route 53 servers answer AAAA with an out-of-zone
// SOA (fcdo.gov.uk). Azure DNS on GitHub runners SERVFAILs that AAAA query, and
// Dagger's in-engine resolver (10.87.0.1) turns the SERVFAIL into a TIMEOUT: in
// a Dagger container on a GitHub runner, getaddrinfo(AF_UNSPEC) took 15s and
// `family: 6` took 10s -> EAI_AGAIN. undici counts DNS inside its 10s connect
// budget, so fetch died as `fetch failed <- UND_ERR_CONNECT_TIMEOUT`. The A
// query answers in ~2ms. Feeds are therefore resolved IPv4-only: no AAAA query
// is ever sent, so a broken AAAA path cannot stall a publish.

/** A resolver that answers A instantly but never answers anything else — the
 * observed behaviour of Dagger's resolver for this host on a GitHub runner. */
function aaaaHangsLookup(seen: unknown[]): LookupFunction {
	return (_hostname, options, callback) => {
		seen.push(options.family);
		if (options.family !== 4) {
			return; // the AAAA leg never comes back
		}
		if (options.all === true) {
			callback(null, [{ address: "127.0.0.1", family: 4 }]);
		} else {
			callback(null, "127.0.0.1", 4);
		}
	};
}

async function listen(server: Server): Promise<number> {
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	return (server.address() as AddressInfo).port;
}

describe("feed hosts resolve over IPv4 only", () => {
	const cleanup: Array<() => Promise<unknown>> = [];

	afterEach(async () => {
		vi.restoreAllMocks();
		await Promise.all(cleanup.splice(0).map((close) => close()));
	});

	it("connects even when the AAAA lookup never answers", async () => {
		const server = createServer((_req, res) => res.end("ok"));
		const port = await listen(server);
		const seen: unknown[] = [];
		const dispatcher = createFeedDispatcher(aaaaHangsLookup(seen));
		cleanup.push(
			() => dispatcher.close(),
			() => new Promise((resolve) => server.close(resolve)),
		);

		const response = await fetch(`http://feed.test:${port}/list.csv`, {
			dispatcher,
			signal: AbortSignal.timeout(3_000),
		} as RequestInit);

		expect(await response.text()).toBe("ok");
		expect(seen.length).toBeGreaterThan(0);
		expect(seen.every((family) => family === 4)).toBe(true);
	});

	it("routes every feed request through the IPv4-only dispatcher", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("ok", { status: 200 }));

		await fetchWithTimeout("https://example.test/feed", "UK");

		const init = fetchMock.mock.calls[0]?.[1] as { dispatcher?: unknown };
		expect(init.dispatcher).toBe(FEED_DISPATCHER);
	});
});
