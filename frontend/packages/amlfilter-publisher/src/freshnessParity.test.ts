// CROSS-IMPLEMENTATION PARITY: the browser and the publisher must give the SAME
// answer about the SAME list.
//
// WHY THIS SUITE EXISTS. One rule about how old a list is used to be written
// three times — the browser's catalog narrow, the publisher's carry-forward
// anchor, and the publisher's published-freshness gate. Copies of a rule
// diverge, and these did: against the live aml-filter.com bundle the publisher
// aged every list from the bundle's `generatedAt` and served it, while the
// browser rejected the identical bytes and would have stopped the deployed app
// loading its watchlist at all. Nobody noticed, because no test ever fed the two
// implementations the same input and compared them.
//
// So this feeds ONE catalog entry through all THREE consumers and asserts the
// verdicts are identical:
//
//   1. BROWSER — `openBundleSource` (the real bundle-open path) over a fake sync
//      client serving that catalog. Accepts, and states which instant it will age
//      the list from.
//   2. CARRY-FORWARD — `publishedFetchedAt`, which decides what instant a
//      re-served list is stamped with.
//   3. FRESHNESS GATE — `checkPublishedFreshness` over a REAL signed origin
//      (signed pointer -> manifest -> content-addressed chunk).
//
// The rule they all read is `resolveListAge` in @amlfilter/browser/watchlist.
// The point of this file is that there is nowhere left for a second copy to hide:
// if one consumer stops calling the shared rule, these assertions go red.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type BundleEngineClient, openBundleSource } from "@amlfilter/browser";
import { describe, expect, it } from "vitest";
import { publishedFetchedAt } from "./carryForwardList.ts";
import {
	checkPublishedFreshness,
	StaleBundleError,
} from "./checkPublishedFreshness.ts";
import { fetchFrom, signedOriginFactory } from "./signedOriginFixture.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..", "fixtures");
const PUBKEY = new Uint8Array(readFileSync(join(FIXTURES, "demo-public.key")));
const PRIVKEY = new Uint8Array(readFileSync(join(FIXTURES, "demo.key")));
const BASE = "https://aml-filter.com/bundle/origin";
const ENCODER = new TextEncoder();
const signedOrigin = signedOriginFactory(BASE, PRIVKEY);

/** Frozen clock, and anchors close to it, so NOTHING here is ever rejected for
 * being merely old — every rejection below is a rejection of the age PROOF. */
const NOW = new Date("2026-08-01T20:00:00.000Z");
const GENERATED_AT = "2026-08-01T18:23:54.891Z";
const FETCHED_AT = "2026-08-01T12:00:00.000Z";

/** The identity half every case shares; only the freshness block varies. */
const IDENTITY = {
	id: "OFAC_SDN",
	title: "OFAC SDN",
	slug: "ofac",
	version: "2026-08-01",
	entitiesCount: 19_181,
};

/** What each consumer decided: rejected, or the instant + anchor it will use. */
type Verdict = string;

const REJECTED: Verdict = "REJECTED";

function accepted(at: string, from: string): Verdict {
	return `ACCEPTED aged from ${from} @ ${at}`;
}

function catalogDoc(
	entry: Record<string, unknown>,
	generatedAt: unknown,
): Record<string, unknown> {
	return { schemaVersion: 1, generatedAt, lists: [{ ...IDENTITY, ...entry }] };
}

// --- consumer 1: the browser's real bundle-open path ------------------------

function fakeClient(catalog: Uint8Array): BundleEngineClient {
	return {
		sync: () =>
			Promise.resolve({
				manifestHash: "0".repeat(64),
				version: "2026-08-01",
				chunksFetched: 0,
				chunksReused: 0,
				bytesFetched: 0,
			}),
		readFile: (path: string) =>
			path === "catalog.json"
				? Promise.resolve(catalog)
				: Promise.reject(new Error(`unexpected read ${path}`)),
		clear: () => Promise.resolve(),
	};
}

async function browserVerdict(
	entry: Record<string, unknown>,
	generatedAt: unknown,
): Promise<Verdict> {
	const bytes = ENCODER.encode(JSON.stringify(catalogDoc(entry, generatedAt)));
	try {
		const source = await openBundleSource(BASE, `${BASE}/public.key`, {
			createClient: () => fakeClient(bytes),
		});
		const list = source.loadCatalog().lists[0];
		return list === undefined
			? REJECTED
			: accepted(list.fetchedAt, list.agedFrom);
	} catch {
		return REJECTED;
	}
}

// --- consumer 2: the publisher's carry-forward anchor -----------------------

function carryForwardVerdict(
	entry: Record<string, unknown>,
	generatedAt: unknown,
): Verdict {
	try {
		// A per-list meta.json carries its own generatedAt; the catalog entry is
		// aged from the catalog's. Same rule, same role — so the same anchor.
		const at = publishedFetchedAt("ofac", {
			...entry,
			generatedAt,
		} as { fetchedAt?: string; generatedAt?: string });
		return accepted(at, at === generatedAt ? "generatedAt" : "fetchedAt");
	} catch {
		return REJECTED;
	}
}

// --- consumer 3: the publisher's published-freshness gate -------------------

async function gateVerdict(
	entry: Record<string, unknown>,
	generatedAt: unknown,
): Promise<Verdict> {
	const tree = await signedOrigin(catalogDoc(entry, generatedAt));
	try {
		const report = await checkPublishedFreshness({
			baseUrl: BASE,
			fetchBytes: fetchFrom(tree),
			pubkey: PUBKEY,
			maxAgeHours: 26,
			now: () => NOW,
		});
		const list = report.lists[0];
		return list === undefined ||
			list.fetchedAt === null ||
			list.agedFrom === null
			? REJECTED
			: accepted(list.fetchedAt, list.agedFrom);
	} catch (error) {
		if (error instanceof StaleBundleError) {
			return REJECTED;
		}
		throw error;
	}
}

/** Every freshness block this rule has to have one answer for. */
const CASES: ReadonlyArray<{
	readonly name: string;
	readonly entry: Record<string, unknown>;
	readonly generatedAt: unknown;
	readonly expected: Verdict;
}> = [
	{
		// EXACTLY what aml-filter.com serves today: no per-list freshness at all.
		name: "legacy entry (no freshness block), catalog has generatedAt",
		entry: {},
		generatedAt: GENERATED_AT,
		expected: accepted(GENERATED_AT, "generatedAt"),
	},
	{
		name: "new-format entry with a complete freshness block",
		entry: {
			fetchedAt: FETCHED_AT,
			sourceUpdatedAt: "2026-08-01T10:00:00.000Z",
			stale: false,
			staleReason: null,
		},
		generatedAt: GENERATED_AT,
		expected: accepted(FETCHED_AT, "fetchedAt"),
	},
	{
		name: 'fetchedAt: "" — present but empty, so NOT a migration',
		entry: {
			fetchedAt: "",
			sourceUpdatedAt: null,
			stale: false,
			staleReason: null,
		},
		generatedAt: GENERATED_AT,
		expected: REJECTED,
	},
	{
		name: 'fetchedAt: "whenever" — present but unparseable',
		entry: {
			fetchedAt: "whenever",
			sourceUpdatedAt: null,
			stale: false,
			staleReason: null,
		},
		generatedAt: GENERATED_AT,
		expected: REJECTED,
	},
	{
		name: "fetchedAt: 12345 — an epoch number is not the wire type",
		entry: {
			fetchedAt: 12_345,
			sourceUpdatedAt: null,
			stale: false,
			staleReason: null,
		},
		generatedAt: GENERATED_AT,
		expected: REJECTED,
	},
	{
		name: "legacy entry with NO catalog generatedAt — nothing to age it from",
		entry: {},
		generatedAt: undefined,
		expected: REJECTED,
	},
];

describe("freshness parity — browser, carry-forward and the staleness gate", () => {
	it.each(CASES)("$name", async ({ entry, generatedAt, expected }) => {
		const browser = await browserVerdict(entry, generatedAt);
		const carryForward = carryForwardVerdict(entry, generatedAt);
		const gate = await gateVerdict(entry, generatedAt);

		// The load-bearing assertion: all three agree. A divergence here is the
		// exact defect this suite exists to make impossible.
		expect({ browser, carryForward, gate }).toEqual({
			browser: expected,
			carryForward: expected,
			gate: expected,
		});
	});

	it("is not vacuous — at least one case is ACCEPTED and one REJECTED", () => {
		expect(CASES.filter((c) => c.expected !== REJECTED).length).toBeGreaterThan(
			0,
		);
		expect(CASES.filter((c) => c.expected === REJECTED).length).toBeGreaterThan(
			0,
		);
	});

	it("ACCEPTS the shape the live production bundle actually publishes", async () => {
		// Regression pin for the deploy hazard. The live catalog carries NO
		// fetchedAt, sourceUpdatedAt, stale or staleReason on any list. If the
		// browser ever rejects this shape again, the deployed app stops loading its
		// watchlist the moment the origin re-serves a pre-freshness bundle.
		const live = {
			schemaVersion: 1,
			generatedAt: GENERATED_AT,
			lists: [IDENTITY],
		};
		const bytes = ENCODER.encode(JSON.stringify(live));
		const source = await openBundleSource(BASE, `${BASE}/public.key`, {
			createClient: () => fakeClient(bytes),
		});
		expect(source.loadCatalog().lists[0]).toMatchObject({
			id: "OFAC_SDN",
			fetchedAt: GENERATED_AT,
			agedFrom: "generatedAt",
			stale: false,
		});
	});
});
