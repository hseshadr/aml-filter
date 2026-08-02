// carryForwardList — per-list independence when ONE upstream feed is down.
//
// THE BUG THIS EXISTS FOR. All four sanctions feeds used to be required
// together, so a 500 from the EU webgate blocked the OFAC refresh too — and OFAC
// is the list every visitor screens against by default. A European outage aged
// the data for users who never enabled EU. (Real: the EU feed 500'd all day on
// 2026-08-02 and took the whole daily publish down with it.)
//
// THE FIX IS NOT "make feeds optional". A screening tool that silently ships a
// partial watchlist is worse than one that ships nothing. Instead: refresh each
// list independently, and for a list that could NOT be refreshed, re-serve the
// EXACT bytes already published — re-verified through the full trust chain —
// carrying its OWN age and marked stale. Never fresher than the truth.
//
// Two layers of test, deliberately:
//   - the trust chain, driven against the COMMITTED demo origin: a real
//     Ed25519-signed, content-addressed 4-list bundle verifying against
//     fixtures/demo-public.key. Real bytes, not bytes we synthesized.
//   - the freshness + population rules, driven as pure functions, so each can be
//     watched failing on its own without fighting content-addressing to get there.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	assertPopulation,
	CarryForwardError,
	carryForwardList,
	publishedFetchedAt,
} from "./carryForwardList.ts";
import type { OriginFetch } from "./verifyPublishedOrigin.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ORIGIN_DIR = join(
	HERE,
	"..",
	"..",
	"..",
	"app",
	"public",
	"bundle",
	"origin",
);
const FIXTURES = join(HERE, "..", "fixtures");
const BASE = "https://aml-filter.com/bundle/origin";

const PUBKEY = new Uint8Array(readFileSync(join(FIXTURES, "demo-public.key")));
const REASON = "EU request failed: 500 Internal Server Error";
const NOW = new Date("2026-06-22T00:00:00Z");

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

/** An OriginFetch backed by the committed, really-signed demo origin tree. */
function liveFetch(): OriginFetch {
	return (url: string) => {
		if (!url.startsWith(`${BASE}/`)) {
			return Promise.reject(new Error(`unexpected url ${url}`));
		}
		const rel = url.slice(BASE.length + 1).split("/");
		return Promise.resolve(
			new Uint8Array(readFileSync(join(ORIGIN_DIR, ...rel))),
		);
	};
}

/** Wrap a fetch so matching URLs get doctored bytes. */
function tamper(
	inner: OriginFetch,
	match: (url: string) => boolean,
	doctor: (bytes: Uint8Array) => Uint8Array,
): OriginFetch {
	return async (url) => {
		const bytes = await inner(url);
		return match(url) ? doctor(bytes) : bytes;
	};
}

function carry(fetchBytes: OriginFetch, slug = "eu") {
	return carryForwardList({
		baseUrl: BASE,
		fetchBytes,
		pubkey: PUBKEY,
		slug,
		reason: REASON,
		now: () => NOW,
	});
}

describe("carryForwardList, against the committed signed demo origin", () => {
	it("re-serves the published list's real records", async () => {
		const carried = await carry(liveFetch());

		expect(carried.listId).toBe("EU_CONSOLIDATED");
		expect(carried.title).toBe("EU Consolidated");
		expect(carried.slug).toBe("eu");
		// Real records came back — not a placeholder, not an empty list.
		expect(carried.entities).toHaveLength(2);
		expect(carried.entities[0]?.entity_id).toMatch(/^EU_CONSOLIDATED:/);
		// Vectors round-trip at full width: entities * dim.
		expect(carried.dim).toBe(384);
		expect(carried.vectors).toHaveLength(2 * 384);
	});

	it("carries ONLY the requested list, leaving the others alone", async () => {
		const carried = await carry(liveFetch(), "uk");
		expect(carried.listId).toBe("UK_OFSI");
		expect(carried.entities.every((e) => e.source_list === "UK_OFSI")).toBe(
			true,
		);
	});

	it("keeps the list's OWN version — a carried list was not rebuilt today", async () => {
		expect((await carry(liveFetch())).version).toBe("demo-1");
	});

	it("marks it stale, with the upstream failure recorded verbatim", async () => {
		const { freshness } = await carry(liveFetch());
		expect(freshness.stale).toBe(true);
		expect(freshness.staleReason).toBe(REASON);
	});

	// MIGRATION. Every bundle published before per-list freshness existed has no
	// `fetchedAt` in its meta.json — including the one live right now. The first
	// outage after this ships must not crash the publisher, and must not invent a
	// timestamp either. `generatedAt` is the truthful fallback: it is when that
	// data was actually assembled.
	it("ages a pre-freshness published bundle from its generatedAt", async () => {
		const { freshness } = await carry(liveFetch());
		expect(freshness.fetchedAt).toBe("2026-06-19T00:00:00Z");
		// It publishes no upstream instant, so we claim none.
		expect(freshness.sourceUpdatedAt).toBeNull();
	});

	describe("fails closed — the trust chain is re-proven, not assumed", () => {
		it("refuses a pointer whose signature does not verify", async () => {
			const fetchBytes = tamper(
				liveFetch(),
				(url) => url.endsWith("/latest"),
				(bytes) => {
					const pointer = JSON.parse(DECODER.decode(bytes));
					pointer.version = "tampered";
					return ENCODER.encode(JSON.stringify(pointer));
				},
			);
			await expect(carry(fetchBytes)).rejects.toThrow();
		});

		it("refuses a chunk whose bytes do not match its content address", async () => {
			const fetchBytes = tamper(
				liveFetch(),
				(url) => url.includes("/chunk/"),
				(bytes) => {
					const flipped = new Uint8Array(bytes);
					flipped[flipped.length - 1] = (flipped.at(-1) ?? 0) ^ 0xff;
					return flipped;
				},
			);
			await expect(carry(fetchBytes)).rejects.toThrow();
		});

		it("refuses a manifest that does not match the signed pointer", async () => {
			const fetchBytes = tamper(
				liveFetch(),
				(url) => url.includes("/manifest/"),
				(bytes) => {
					const flipped = new Uint8Array(bytes);
					flipped[flipped.length - 1] = 0x20; // whitespace: still valid JSON
					return flipped;
				},
			);
			await expect(carry(fetchBytes)).rejects.toThrow();
		});

		it("refuses a slug the published bundle does not contain", async () => {
			await expect(carry(liveFetch(), "nope")).rejects.toThrow(
				CarryForwardError,
			);
		});
	});
});

// The rules that decide whether a carried list may be served at all. Each is
// exercised directly so it can be watched failing for its own reason.
describe("publishedFetchedAt — a list we cannot age is never re-served", () => {
	it("prefers the published fetchedAt once bundles carry one", () => {
		expect(
			publishedFetchedAt("eu", {
				fetchedAt: "2026-06-20T06:00:00Z",
				generatedAt: "2026-06-19T00:00:00Z",
			}),
		).toBe("2026-06-20T06:00:00Z");
	});

	it("falls back to generatedAt for a pre-freshness bundle", () => {
		expect(
			publishedFetchedAt("eu", { generatedAt: "2026-06-19T00:00:00Z" }),
		).toBe("2026-06-19T00:00:00Z");
	});

	// The whole point. Defaulting a missing timestamp to "now" would relabel
	// three-day-old sanctions data as current — the exact lie this change exists
	// to prevent. "Cannot tell" must mean REFUSE, never "fine".
	it("refuses when neither anchor is present", () => {
		expect(() => publishedFetchedAt("eu", {})).toThrow(/age/i);
	});

	it("refuses an unparseable instant rather than guessing", () => {
		expect(() => publishedFetchedAt("eu", { fetchedAt: "whenever" })).toThrow(
			/age/i,
		);
	});

	it("refuses an empty string", () => {
		expect(() => publishedFetchedAt("eu", { fetchedAt: "  " })).toThrow(/age/i);
	});
});

describe("assertPopulation — a truncated carried list is refused", () => {
	const meta = { entitiesCount: 2, dim: 384 };

	it("accepts a list that matches its published meta", () => {
		expect(() => assertPopulation("eu", meta, 2, 2 * 384)).not.toThrow();
	});

	it("refuses a record count that disagrees with the published meta", () => {
		expect(() => assertPopulation("eu", meta, 1, 384)).toThrow(/entit/i);
	});

	it("refuses a vector width that disagrees with the record count", () => {
		expect(() => assertPopulation("eu", meta, 2, 999)).toThrow(/vector/i);
	});
});
