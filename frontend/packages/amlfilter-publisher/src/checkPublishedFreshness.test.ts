// checkPublishedFreshness — proving the staleness guard can actually FAIL.
//
// WHY THIS SUITE EXISTS. aml-filter.com tells visitors the sanctions bundle is
// rebuilt daily and is at most ~24h stale. Until this checker landed, nothing
// enforced that: the `publish-watchlist` cron died on a missing signing secret
// for 22 CONSECUTIVE DAYS (2026-06-21 → 2026-07-12) and the site kept serving an
// ever-older list, because a failed scheduled run is a red dot nobody looks at.
// A stated property with no guard is not a property.
//
// A guard nobody has watched fail is not evidence either, so most of this file
// is deliberately-broken bundles: a list fetched three days ago, a list whose
// `fetchedAt` is missing, a list the publisher itself marked `stale`, a catalog
// with NO lists at all (the vacuous pass), a pointer signed by the wrong key,
// and a dead network. Each must go RED. One test drives a genuinely fresh
// bundle so the checker is not simply always-failing.
//
// The fixtures are real signed origins: a catalog is content-addressed into a
// chunk, the chunk into a manifest, the manifest hash into an Ed25519-signed
// /latest pointer — the exact chain the browser verifies.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	canonicalBytes,
	type JsonValue,
	sha256Hex,
} from "@amlfilter/browser/engine";
import { describe, expect, it, vi } from "vitest";
import {
	checkPublishedFreshness,
	DEFAULT_MAX_AGE_HOURS,
	FreshnessError,
	parseFreshnessArgs,
	runCheckPublishedFreshness,
	StaleBundleError,
} from "./checkPublishedFreshness.ts";
import { signBytes } from "./signing.ts";
import type { OriginFetch } from "./verifyPublishedOrigin.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..", "fixtures");
const PUBKEY = new Uint8Array(readFileSync(join(FIXTURES, "demo-public.key")));
const PRIVKEY = new Uint8Array(readFileSync(join(FIXTURES, "demo.key")));
const BASE = "https://aml-filter.com/bundle/origin";

const ENCODER = new TextEncoder();
/** A fixed "now" so every age in this suite is exact, not clock-dependent. */
const NOW = new Date("2026-08-01T12:00:00.000Z");
const now = (): Date => NOW;

function hoursAgo(hours: number): string {
	return new Date(NOW.getTime() - hours * 60 * 60 * 1_000).toISOString();
}

/**
 * A single zstd frame carrying one RAW (uncompressed) block.
 *
 * Production chunks are compressed by `edgeproc publish`, whose zstd encoder is
 * not resolvable from this package. A raw-block frame is still one legitimate
 * frame that bindingly declares its Frame_Content_Size, so the CLIENT decode
 * path (`decompressAndVerify`, via @hpcc-js/wasm-zstd) accepts and decodes it
 * exactly as it does a compressed chunk — which is the path under test.
 */
function zstdRawFrame(plaintext: Uint8Array): Uint8Array {
	const frame = new Uint8Array(12 + plaintext.byteLength);
	const view = new DataView(frame.buffer);
	view.setUint32(0, 0xfd2f_b528, true); // Magic_Number
	view.setUint8(4, 0b1010_0000); // FCS field = 4 bytes, Single_Segment set
	view.setUint32(5, plaintext.byteLength, true); // Frame_Content_Size
	// Block_Header, 24-bit LE: Last_Block=1, Block_Type=Raw(0), Block_Size.
	const header = (plaintext.byteLength << 3) | 1;
	frame[9] = header & 0xff;
	frame[10] = (header >>> 8) & 0xff;
	frame[11] = (header >>> 16) & 0xff;
	frame.set(plaintext, 12);
	return frame;
}

interface OriginOptions {
	readonly version?: string;
	readonly sequence?: number;
	/** Sign with this key instead of the matching demo key. */
	readonly signWith?: Uint8Array;
	/** Drop catalog.json from the manifest entirely. */
	readonly omitCatalog?: boolean;
	/** Publish these exact bytes as catalog.json, valid JSON or not. */
	readonly rawCatalog?: string;
}

/** Build a REAL signed origin whose only file is the given catalog. */
async function signedOrigin(
	catalog: unknown,
	options: OriginOptions = {},
): Promise<Map<string, Uint8Array>> {
	const version = options.version ?? "2026-08-01";
	const catalogBytes = ENCODER.encode(
		options.rawCatalog ?? `${JSON.stringify(catalog, null, 2)}\n`,
	);
	const chunkHash = await sha256Hex(catalogBytes);
	const files = options.omitCatalog === true ? [] : [catalogFile(chunkHash)];
	const manifestBytes = ENCODER.encode(
		JSON.stringify({ schema_version: 1, version, files }),
	);
	const manifestHash = await sha256Hex(manifestBytes);
	const pointer = {
		manifest_hash: manifestHash,
		version,
		bundle_id: null,
		channel: null,
		sequence: options.sequence ?? 50,
	};
	const signature = await signBytes(
		options.signWith ?? PRIVKEY,
		canonicalBytes(pointer as unknown as JsonValue, {
			exclude: { signature: true, bundle_id: true, channel: true },
		}),
	);
	return new Map([
		[
			`${BASE}/latest`,
			ENCODER.encode(JSON.stringify({ ...pointer, signature })),
		],
		[`${BASE}/manifest/${manifestHash}`, manifestBytes],
		[`${BASE}/chunk/${chunkHash}`, zstdRawFrame(catalogBytes)],
	]);
}

function catalogFile(chunkHash: string): unknown {
	return {
		path: "catalog.json",
		file_type: "json",
		file_sha256: chunkHash,
		chunks: [{ hash: chunkHash }],
	};
}

/** An OriginFetch over an in-memory origin; an unknown URL is a 404, not a pass. */
function fetchFrom(tree: Map<string, Uint8Array>): OriginFetch {
	return (url: string) => {
		const bytes = tree.get(url);
		return bytes === undefined
			? Promise.reject(new Error(`fetch ${url} failed: 404 Not Found`))
			: Promise.resolve(bytes);
	};
}

interface ListOverrides {
	readonly id?: string;
	readonly slug?: string;
	readonly fetchedAt?: unknown;
	readonly entitiesCount?: unknown;
	readonly stale?: unknown;
	readonly staleReason?: unknown;
}

/** Drop keys entirely, so the published entry genuinely lacks them. */
function without(
	entry: Record<string, unknown>,
	...keys: readonly string[]
): Record<string, unknown> {
	const out = { ...entry };
	for (const key of keys) {
		delete out[key];
	}
	return out;
}

/** One catalog list entry, fresh unless the test says otherwise. */
function list(overrides: ListOverrides = {}): Record<string, unknown> {
	const base: Record<string, unknown> = {
		id: "OFAC_SDN",
		title: "OFAC SDN",
		slug: "ofac",
		version: "2026-08-01",
		entitiesCount: 17_123,
		fetchedAt: hoursAgo(5),
		sourceUpdatedAt: hoursAgo(9),
		stale: false,
		staleReason: null,
	};
	return { ...base, ...overrides };
}

function catalogOf(
	lists: readonly unknown[],
	generatedAt: unknown = hoursAgo(5),
): unknown {
	return { schemaVersion: 1, generatedAt, lists };
}

async function check(
	catalog: unknown,
	options: OriginOptions = {},
): Promise<ReturnType<typeof checkPublishedFreshness>> {
	return checkPublishedFreshness({
		baseUrl: BASE,
		fetchBytes: fetchFrom(await signedOrigin(catalog, options)),
		pubkey: PUBKEY,
		maxAgeHours: DEFAULT_MAX_AGE_HOURS,
		now,
	});
}

/** Run the check and return the failure message (fails the test if it passes). */
async function messageFrom(
	catalog: unknown,
	options: OriginOptions = {},
): Promise<string> {
	try {
		await check(catalog, options);
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error("expected the freshness check to FAIL, but it passed");
}

/** Run the check and return the individual breach lines it refused with. */
async function breachesFrom(
	catalog: unknown,
	options: OriginOptions = {},
): Promise<readonly string[]> {
	try {
		await check(catalog, options);
	} catch (error) {
		if (error instanceof StaleBundleError) {
			return error.breaches;
		}
		throw error;
	}
	throw new Error("expected the freshness check to FAIL, but it passed");
}

const FRESH = catalogOf([
	list(),
	list({ id: "EU_CONSOLIDATED", slug: "eu" }),
	list({ id: "UN_CONSOLIDATED", slug: "un" }),
	list({ id: "UK_OFSI", slug: "uk" }),
]);

/** A catalog entry as published BEFORE per-list freshness existed: identity
 * fields only, no `fetchedAt`. This is the exact shape live on aml-filter.com
 * on 2026-08-02. */
function legacyList(id: string, slug: string): Record<string, unknown> {
	return {
		id,
		title: id,
		slug,
		version: "2026-08-01",
		entitiesCount: 6239,
	};
}

const LEGACY_LISTS = [
	legacyList("OFAC_SDN", "ofac"),
	legacyList("UN_CONSOLIDATED", "un"),
	legacyList("EU_CONSOLIDATED", "eu"),
	legacyList("UK_OFSI", "uk"),
];

describe("checkPublishedFreshness passes a genuinely fresh bundle", () => {
	it("reports every list's real age and does not throw", async () => {
		const report = await check(FRESH);

		expect(report.version).toBe("2026-08-01");
		expect(report.sequence).toBe(50);
		expect(report.maxAgeHours).toBe(26);
		expect(report.bundleAgeHours).toBeCloseTo(5, 6);
		expect(report.lists.map((entry) => entry.id)).toEqual([
			"OFAC_SDN",
			"EU_CONSOLIDATED",
			"UN_CONSOLIDATED",
			"UK_OFSI",
		]);
		expect(report.lists.every((entry) => entry.ageHours === 5)).toBe(true);
	});

	it("prints a compact table so a GREEN run still shows the real ages", async () => {
		const report = await check(FRESH);

		expect(report.table).toContain("OFAC_SDN");
		expect(report.table).toContain("UK_OFSI");
		expect(report.table).toContain("5.0");
	});

	it("accepts a list right at the ceiling but not one past it", async () => {
		await expect(
			check(catalogOf([list({ fetchedAt: hoursAgo(26) })], hoursAgo(26))),
		).resolves.toBeDefined();
		await expect(
			check(catalogOf([list({ fetchedAt: hoursAgo(26.5) })], hoursAgo(26))),
		).rejects.toBeInstanceOf(StaleBundleError);
	});
});

describe("checkPublishedFreshness goes RED on a stale bundle", () => {
	it("fails a list fetched three days ago, naming it and its ACTUAL age", async () => {
		const stale = catalogOf([
			list(),
			list({ id: "EU_CONSOLIDATED", slug: "eu", fetchedAt: hoursAgo(72) }),
		]);

		const message = await messageFrom(stale);

		expect(message).toContain("EU_CONSOLIDATED");
		expect(message).toContain("72.0h");
		expect(message).toContain("26h");
		// The healthy list is NOT accused.
		expect(message).not.toContain("OFAC_SDN");
	});

	// CONTRACT REVERSED, deliberately. This test used to assert that an ABSENT
	// `fetchedAt` always fails. That was right while every published bundle was
	// expected to carry one — but it would have opened a false alarm against the
	// pre-per-list-freshness bundle that was live when this guard shipped, and a
	// guard that cries wolf on day one gets muted. An absent `fetchedAt` now
	// falls back to the bundle's `generatedAt` (see the migration block below).
	// The fail-closed half is preserved, and split in two: absent WITH no
	// generatedAt still fails, and a PRESENT-but-malformed value still fails.
	it("falls back for an ABSENT fetchedAt but still fails with no anchor at all", async () => {
		const absent = list({ id: "UK_OFSI", fetchedAt: undefined });

		// Fresh bundle stamp: the list is aged from it rather than accused.
		await expect(
			check(catalogOf([absent], hoursAgo(4))),
		).resolves.toBeDefined();

		// No bundle stamp either: nothing can age it, so it fails.
		const message = await messageFrom({ schemaVersion: 1, lists: [absent] });
		expect(message).toContain("UK_OFSI");
		expect(message).toMatch(/cannot be proven/i);
	});

	it("fails a list whose fetchedAt is unparseable", async () => {
		const message = await messageFrom(
			catalogOf([list({ id: "UN_CONSOLIDATED", fetchedAt: "last Tuesday" })]),
		);

		expect(message).toContain("UN_CONSOLIDATED");
		expect(message).toMatch(/missing|unparseable|cannot be proven/i);
	});

	it("fails a list the publisher itself marked stale, quoting the reason", async () => {
		const message = await messageFrom(
			catalogOf([
				list({
					id: "EU_CONSOLIDATED",
					slug: "eu",
					stale: true,
					staleReason: "EU webgate returned 500",
				}),
			]),
		);

		expect(message).toContain("EU_CONSOLIDATED");
		expect(message).toContain("EU webgate returned 500");
	});

	it("reports EVERY breaching list, not just the first", async () => {
		const broken = catalogOf([
			list(),
			list({ id: "EU_CONSOLIDATED", slug: "eu", fetchedAt: hoursAgo(72) }),
			// Present but malformed — gets no migration fallback, so it breaches.
			list({ id: "UN_CONSOLIDATED", slug: "un", fetchedAt: "not-a-date" }),
			list({
				id: "UK_OFSI",
				slug: "uk",
				stale: true,
				staleReason: "HMT feed timed out",
			}),
		]);

		const message = await messageFrom(broken);

		expect(message).toContain("EU_CONSOLIDATED");
		expect(message).toContain("UN_CONSOLIDATED");
		expect(message).toContain("UK_OFSI");
		expect(message).not.toContain("OFAC_SDN");
	});

	it("fails when the last successful refresh is older than the ceiling", async () => {
		// The 22-day outage shape: the publisher stopped running entirely.
		const message = await messageFrom(catalogOf([list()], hoursAgo(528)));

		expect(message).toMatch(/refresh/i);
		expect(message).toContain("528.0h");
	});

	it("fails when the catalog's generatedAt is missing", async () => {
		// No `generatedAt` key at all — the publisher never recorded when it ran.
		const message = await messageFrom({ schemaVersion: 1, lists: [list()] });

		expect(message).toMatch(/generatedAt/);
	});
});

// A bundle published before per-list `fetchedAt` existed carries no per-list
// age — but in THAT model all four lists were refreshed together in one run, so
// the catalog's own `generatedAt` is a truthful age for every one of them. This
// mirrors carryForwardList.ts's publishedFetchedAt() fallback, and it is the
// only reason this guard does not cry wolf on its very first production run.
//
// The fallback is deliberately narrow: it applies ONLY when `fetchedAt` is
// absent. A `fetchedAt` that is present but malformed is corruption, not
// migration, and must never be laundered into a fresh-looking age.
describe("checkPublishedFreshness ages a pre-per-list-freshness bundle", () => {
	it("falls back to generatedAt and says so", async () => {
		const report = await check(catalogOf(LEGACY_LISTS, hoursAgo(18)));

		expect(report.lists).toHaveLength(4);
		expect(report.lists.every((entry) => entry.ageHours === 18)).toBe(true);
		expect(
			report.lists.every((entry) => entry.agedFrom === "generatedAt"),
		).toBe(true);
		// The reader is never misled about where the number came from.
		expect(report.table).toContain("generatedAt");
	});

	it("still fails the fallback when the bundle itself is three days old", async () => {
		const breaches = await breachesFrom(catalogOf(LEGACY_LISTS, hoursAgo(72)));

		// Every list is accused BY AGE (72h), not by "we cannot tell" — the
		// fallback must produce a real number, then judge it.
		for (const id of [
			"OFAC_SDN",
			"UN_CONSOLIDATED",
			"EU_CONSOLIDATED",
			"UK_OFSI",
		]) {
			const line = breaches.find((entry) => entry.includes(id));
			expect(line, `no breach line for ${id}`).toBeDefined();
			expect(line).toContain("72.0h");
			expect(line).toContain("generatedAt");
		}
	});

	it.each([
		["an empty string", ""],
		["a garbage string", "whenever"],
		["a number", 12_345],
		["an explicit null", null],
	])(
		"refuses a PRESENT but malformed fetchedAt (%s) even when generatedAt is fresh",
		async (_label, fetchedAt) => {
			const message = await messageFrom(
				catalogOf(
					[{ ...legacyList("EU_CONSOLIDATED", "eu"), fetchedAt }],
					hoursAgo(1),
				),
			);

			expect(message).toContain("EU_CONSOLIDATED");
			expect(message).toMatch(/unparseable|cannot be proven/i);
			// The fallback must NOT have been used to launder the bad value.
			expect(message).not.toContain("aged from");
		},
	);

	it("refuses a legacy list when the catalog has no generatedAt either", async () => {
		// No per-list anchor AND no bundle anchor: nothing can age this list.
		const breaches = await breachesFrom({
			schemaVersion: 1,
			lists: [legacyList("OFAC_SDN", "ofac")],
		});

		const line = breaches.find((entry) => entry.includes("OFAC_SDN"));
		expect(line, "no breach line for OFAC_SDN").toBeDefined();
		expect(line).toMatch(/generatedAt/);
		expect(line).toMatch(/cannot be proven/i);
	});
});

// `stale: wire.stale === true` would read a MISSING `stale` as "not stale" —
// the shape-not-property hole this repo keeps rediscovering. Drop one field and
// the list reports itself healthy. The presence of `fetchedAt` is the signal
// that says which format an entry is in, so it also decides which fields are
// mandatory: a NEW-format entry must carry the fields that prove its freshness,
// and a missing one is a malformed catalog, not a healthy list.
describe("checkPublishedFreshness requires a new-format entry to carry its proof", () => {
	it.each([
		["stale missing", without(list(), "stale")],
		['stale as the string "false"', list({ stale: "false" })],
		["stale as 0", list({ stale: 0 })],
		["stale as an object", list({ stale: {} })],
		["stale as null", list({ stale: null })],
	])("fails a fresh-looking list with %s", async (_label, entry) => {
		const message = await messageFrom(catalogOf([entry]));

		expect(message).toContain("OFAC_SDN");
		expect(message).toMatch(/stale/);
		expect(message).toMatch(/malformed/i);
	});

	it.each([
		["staleReason missing", without(list(), "staleReason")],
		["staleReason as a number", list({ staleReason: 42 })],
		["staleReason as an object", list({ staleReason: {} })],
	])("fails a fresh-looking list with %s", async (_label, entry) => {
		const message = await messageFrom(catalogOf([entry]));

		expect(message).toContain("OFAC_SDN");
		expect(message).toMatch(/staleReason/);
		expect(message).toMatch(/malformed/i);
	});

	it.each([
		["entitiesCount missing", without(list(), "entitiesCount")],
		["entitiesCount as a string", list({ entitiesCount: "17123" })],
	])("fails a fresh-looking list with %s", async (_label, entry) => {
		const message = await messageFrom(catalogOf([entry]));

		expect(message).toContain("OFAC_SDN");
		expect(message).toMatch(/entitiesCount/);
	});

	it("accepts a well-formed staleReason string alongside stale: true", async () => {
		const message = await messageFrom(
			catalogOf([list({ stale: true, staleReason: "EU webgate 500" })]),
		);

		// It breaches for being stale — NOT for being malformed.
		expect(message).toContain("EU webgate 500");
		expect(message).not.toMatch(/malformed/i);
	});

	it("does NOT impose the new-format fields on a legacy entry", async () => {
		// A pre-freshness entry has no per-list staleness at all; requiring it
		// would reintroduce exactly the day-one false alarm we just removed.
		const report = await check(catalogOf(LEGACY_LISTS, hoursAgo(18)));

		expect(report.lists.every((entry) => entry.stale === false)).toBe(true);
		expect(report.lists.flatMap((entry) => entry.breaches)).toEqual([]);
	});

	it("renders an unknown entitiesCount as 'unknown', never as -1", async () => {
		const report = await check(
			catalogOf(
				[without(legacyList("OFAC_SDN", "ofac"), "entitiesCount")],
				hoursAgo(4),
			),
		);

		expect(report.lists[0]?.entitiesCount).toBeNull();
		expect(report.table).toContain("unknown");
		expect(report.table).not.toContain("-1");
	});
});

describe("checkPublishedFreshness fails closed when it cannot tell", () => {
	it("refuses a catalog with NO lists — a vacuous pass is not a pass", async () => {
		await expect(check(catalogOf([]))).rejects.toBeInstanceOf(FreshnessError);
		expect(await messageFrom(catalogOf([]))).toMatch(/no lists/i);
	});

	it("refuses a pointer signed by the wrong key", async () => {
		const wrongKey = new Uint8Array(32).fill(7);

		await expect(check(FRESH, { signWith: wrongKey })).rejects.toThrow();
	});

	it("refuses a manifest with no catalog.json", async () => {
		expect(await messageFrom(FRESH, { omitCatalog: true })).toMatch(
			/catalog\.json/,
		);
	});

	it("refuses tampered chunk bytes (content-address check)", async () => {
		const tree = await signedOrigin(FRESH);
		for (const [url, bytes] of tree) {
			if (url.includes("/chunk/")) {
				const doctored = Uint8Array.from(bytes);
				// Corrupt the raw block's payload (byte 12 onward is the plaintext),
				// so the decoded catalog no longer hashes to the chunk's own name.
				doctored.set([0x00, 0x01, 0x02], 12);
				tree.set(url, doctored);
			}
		}

		await expect(
			checkPublishedFreshness({
				baseUrl: BASE,
				fetchBytes: fetchFrom(tree),
				pubkey: PUBKEY,
				maxAgeHours: DEFAULT_MAX_AGE_HOURS,
				now,
			}),
		).rejects.toThrow();
	});

	it("refuses a network error — it never reads as 'fresh'", async () => {
		await expect(
			checkPublishedFreshness({
				baseUrl: BASE,
				fetchBytes: () => Promise.reject(new Error("ECONNREFUSED")),
				pubkey: PUBKEY,
				maxAgeHours: DEFAULT_MAX_AGE_HOURS,
				now,
			}),
		).rejects.toThrow(/ECONNREFUSED/);
	});

	it("refuses a catalog.json that is not valid JSON", async () => {
		expect(await messageFrom(FRESH, { rawCatalog: "{ not json" })).toMatch(
			/not valid JSON/,
		);
	});

	it("refuses a list entry with no id, slug or fetchedAt at all", async () => {
		// Every identity field missing: the checker must still name the offender
		// and refuse, rather than crash or silently skip an unrecognisable entry.
		const message = await messageFrom(
			catalogOf([{ entitiesCount: "lots", fetchedAt: "nope" }]),
		);

		expect(message).toContain("(unnamed list)");
		expect(message).toMatch(/cannot be proven/);
	});

	it("uses the real clock when no `now` is injected", async () => {
		// A catalog stamped just now must pass against the wall clock, which
		// proves the default `now` is wired and not stuck at epoch.
		const justNow = new Date().toISOString();
		const report = await checkPublishedFreshness({
			baseUrl: BASE,
			fetchBytes: fetchFrom(
				await signedOrigin({
					schemaVersion: 1,
					generatedAt: justNow,
					lists: [list({ fetchedAt: justNow })],
				}),
			),
			pubkey: PUBKEY,
			maxAgeHours: DEFAULT_MAX_AGE_HOURS,
		});

		expect(report.bundleAgeHours).toBeLessThan(0.1);
	});

	it("refuses a catalog whose lists are not an array", async () => {
		await expect(
			check({
				schemaVersion: 1,
				generatedAt: hoursAgo(1),
				lists: "all of them",
			}),
		).rejects.toBeInstanceOf(FreshnessError);
	});
});

describe("the freshness CLI", () => {
	it("defaults --max-age-hours to 26 (24h cadence + 2h of slow-run headroom)", () => {
		const args = parseFreshnessArgs([
			"--base-url",
			`${BASE}/`,
			"--pubkey",
			"public.key",
		]);

		expect(args.maxAgeHours).toBe(DEFAULT_MAX_AGE_HOURS);
		expect(args.baseUrl).toBe(BASE); // trailing slash trimmed
	});

	it("accepts an explicit --max-age-hours", () => {
		const args = parseFreshnessArgs([
			"--base-url",
			BASE,
			"--pubkey",
			"public.key",
			"--max-age-hours",
			"6",
		]);

		expect(args.maxAgeHours).toBe(6);
		expect(args.pubkeyPath).toBe("public.key");
	});

	it.each([
		["an unknown flag", ["--base-url", BASE, "--pubkey", "k", "--nope", "1"]],
		["a missing --pubkey", ["--base-url", BASE]],
		[
			"a non-numeric ceiling",
			["--base-url", BASE, "--pubkey", "k", "--max-age-hours", "soon"],
		],
		[
			"a negative ceiling",
			["--base-url", BASE, "--pubkey", "k", "--max-age-hours", "-1"],
		],
		["a dangling flag with no value", ["--base-url", BASE, "--pubkey"]],
		["a bare word where a --flag belongs", ["base-url", BASE]],
	])("rejects %s", (_label, argv) => {
		expect(() => parseFreshnessArgs(argv)).toThrow(FreshnessError);
	});

	it("logs the table on a fresh origin and resolves", async () => {
		const lines: string[] = [];

		const report = await runCheckPublishedFreshness(
			["--base-url", BASE, "--pubkey", "demo-public.key"],
			{
				fetchBytes: fetchFrom(await signedOrigin(FRESH)),
				readFile: () => PUBKEY,
				log: (line) => lines.push(line),
				now,
			},
		);

		expect(report.lists).toHaveLength(4);
		expect(lines.join("\n")).toContain("OFAC_SDN");
	});

	it("writes its report to stdout when no log sink is injected", async () => {
		const written: string[] = [];
		const spy = vi
			.spyOn(process.stdout, "write")
			.mockImplementation((chunk: string | Uint8Array) => {
				written.push(String(chunk));
				return true;
			});

		try {
			await runCheckPublishedFreshness(
				["--base-url", BASE, "--pubkey", "demo-public.key"],
				{
					fetchBytes: fetchFrom(await signedOrigin(FRESH)),
					readFile: () => PUBKEY,
					now,
				},
			);
		} finally {
			spy.mockRestore();
		}

		expect(written.join("")).toContain("published origin is FRESH");
	});

	it("throws StaleBundleError from the CLI on a stale origin", async () => {
		const stale = catalogOf([list({ fetchedAt: hoursAgo(99) })], hoursAgo(99));

		await expect(
			runCheckPublishedFreshness(
				["--base-url", BASE, "--pubkey", "demo-public.key"],
				{
					fetchBytes: fetchFrom(await signedOrigin(stale)),
					readFile: () => PUBKEY,
					log: () => {},
					now,
				},
			),
		).rejects.toBeInstanceOf(StaleBundleError);
	});
});
