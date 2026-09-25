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
import { describe, expect, it, vi } from "vitest";
import {
	checkPublishedFreshness,
	DEFAULT_MAX_AGE_HOURS,
	FreshnessError,
	parseFreshnessArgs,
	runCheckPublishedFreshness,
	StaleBundleError,
} from "./checkPublishedFreshness.ts";
import {
	fetchFrom,
	type OriginOptions,
	signedOriginFactory,
} from "./signedOriginFixture.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..", "fixtures");
const PUBKEY = new Uint8Array(readFileSync(join(FIXTURES, "demo-public.key")));
const PRIVKEY = new Uint8Array(readFileSync(join(FIXTURES, "demo.key")));
const BASE = "https://aml-filter.com/bundle/origin";
/** A fixed "now" so every age in this suite is exact, not clock-dependent. */
const NOW = new Date("2026-08-01T12:00:00.000Z");
const now = (): Date => NOW;

function hoursAgo(hours: number): string {
	return new Date(NOW.getTime() - hours * 60 * 60 * 1_000).toISOString();
}

/** The signed-origin builder + in-memory fetch live in signedOriginFixture.ts,
 * so this suite and the cross-implementation parity suite drive the SAME chain. */
const signedOrigin = signedOriginFactory(BASE, PRIVKEY);

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

// --- post-deploy smoke mode ----------------------------------------------------
//
// The post-deploy live smoke asks a narrower question than the strict 6-hourly
// freshness gate: "is what we just shipped inside the product's documented
// limits?" A list the publisher legitimately carried forward (stale: true) is
// allowed up to the SAME carry ceiling the publisher enforces
// (CARRIED_LIST_CEILING_DAYS = 7) — and not one hour past it. It also demands
// every expected list is PRESENT with a positive entity count, because a
// catalog that silently dropped UK would pass every per-list check vacuously.

const SMOKE_LISTS = [
	"OFAC_SDN",
	"EU_CONSOLIDATED",
	"UN_CONSOLIDATED",
	"UK_OFSI",
] as const;

async function smoke(
	catalog: unknown,
	extra: {
		readonly carryCeilingDays?: number;
		readonly expectLists?: readonly string[];
	},
): Promise<ReturnType<typeof checkPublishedFreshness>> {
	return checkPublishedFreshness({
		baseUrl: BASE,
		fetchBytes: fetchFrom(await signedOrigin(catalog)),
		pubkey: PUBKEY,
		maxAgeHours: DEFAULT_MAX_AGE_HOURS,
		now,
		...extra,
	});
}

async function smokeBreaches(
	catalog: unknown,
	extra: Parameters<typeof smoke>[1],
): Promise<readonly string[]> {
	try {
		await smoke(catalog, extra);
	} catch (error) {
		if (error instanceof StaleBundleError) {
			return error.breaches;
		}
		throw error;
	}
	throw new Error("expected the smoke catalog check to FAIL, but it passed");
}

const carriedUk = (hours: number): Record<string, unknown> =>
	list({
		id: "UK_OFSI",
		slug: "uk",
		fetchedAt: hoursAgo(hours),
		stale: true,
		staleReason: "UK feed fetch failed: ETIMEDOUT",
	});

function catalogWithUk(uk: Record<string, unknown>): unknown {
	return catalogOf([
		list(),
		list({ id: "EU_CONSOLIDATED", slug: "eu" }),
		list({ id: "UN_CONSOLIDATED", slug: "un" }),
		uk,
	]);
}

describe("checkPublishedFreshness in post-deploy smoke mode (carry ceiling)", () => {
	it("passes a list carried 3 days when the documented ceiling is 7", async () => {
		const report = await smoke(catalogWithUk(carriedUk(72)), {
			carryCeilingDays: 7,
		});

		const uk = report.lists.find((entry) => entry.id === "UK_OFSI");
		expect(uk?.stale).toBe(true);
		expect(uk?.breaches).toEqual([]);
		expect(report.table).toContain("STALE");
	});

	it("fails a list carried 8 days — one day past the 7-day ceiling", async () => {
		const breaches = await smokeBreaches(catalogWithUk(carriedUk(8 * 24)), {
			carryCeilingDays: 7,
		});

		expect(breaches).toHaveLength(1);
		expect(breaches[0]).toContain("UK_OFSI (uk)");
		expect(breaches[0]).toContain("7-day carry ceiling");
		expect(breaches[0]).toContain("ETIMEDOUT");
	});

	it("accepts a carried list exactly at the ceiling but not an hour past it", async () => {
		await expect(
			smoke(catalogWithUk(carriedUk(7 * 24)), { carryCeilingDays: 7 }),
		).resolves.toBeDefined();
		await expect(
			smoke(catalogWithUk(carriedUk(7 * 24 + 1)), { carryCeilingDays: 7 }),
		).rejects.toBeInstanceOf(StaleBundleError);
	});

	it("does NOT excuse an old list the publisher never declared carried", async () => {
		const quietlyOld = list({
			id: "UK_OFSI",
			slug: "uk",
			fetchedAt: hoursAgo(72),
		});

		const breaches = await smokeBreaches(catalogWithUk(quietlyOld), {
			carryCeilingDays: 7,
		});

		expect(breaches.join("\n")).toContain("UK_OFSI (uk): last refreshed 72.0h");
	});

	it("keeps the strict gate strict: no ceiling means stale: true is a breach", async () => {
		const breaches = await smokeBreaches(catalogWithUk(carriedUk(1)), {});

		expect(breaches.join("\n")).toContain("re-served the last good copy");
	});
});

describe("checkPublishedFreshness smoke mode refuses what it cannot prove", () => {
	it("fails a carried list whose age cannot be proven", async () => {
		const unprovable = list({
			id: "UK_OFSI",
			slug: "uk",
			fetchedAt: "last Tuesday",
			stale: true,
			staleReason: "UK feed fetch failed",
		});

		const breaches = await smokeBreaches(catalogWithUk(unprovable), {
			carryCeilingDays: 7,
		});

		expect(breaches).toContain(
			"UK_OFSI (uk): carried forward for an unprovable time, past the 7-day carry ceiling — UK feed fetch failed",
		);
	});

	it("says so when a carried list past the ceiling recorded no reason", async () => {
		const silent = list({
			id: "UK_OFSI",
			slug: "uk",
			fetchedAt: hoursAgo(9 * 24),
			stale: true,
			staleReason: null,
		});

		const breaches = await smokeBreaches(catalogWithUk(silent), {
			carryCeilingDays: 7,
		});

		expect(breaches).toEqual([
			"UK_OFSI (uk): carried forward for 216.0h, past the 7-day carry ceiling — no reason recorded",
		]);
	});

	it("fails an expected list that publishes no entity count at all", async () => {
		const uncounted = catalogOf([
			list(),
			list({ id: "EU_CONSOLIDATED", slug: "eu" }),
			list({ id: "UN_CONSOLIDATED", slug: "un" }),
			without(legacyList("UK_OFSI", "uk"), "entitiesCount"),
		]);

		const breaches = await smokeBreaches(uncounted, {
			expectLists: SMOKE_LISTS,
		});

		expect(breaches).toEqual([
			"UK_OFSI (uk): publishes no entity count — its coverage cannot be proven",
		]);
	});
});

describe("checkPublishedFreshness in post-deploy smoke mode (expected lists)", () => {
	it("passes when every expected list is present with entities", async () => {
		const report = await smoke(FRESH, { expectLists: SMOKE_LISTS });

		expect(report.lists.map((entry) => entry.id).sort()).toEqual(
			[...SMOKE_LISTS].sort(),
		);
	});

	it("fails a catalog that silently dropped an expected list", async () => {
		const withoutUk = catalogOf([
			list(),
			list({ id: "EU_CONSOLIDATED", slug: "eu" }),
			list({ id: "UN_CONSOLIDATED", slug: "un" }),
		]);

		const breaches = await smokeBreaches(withoutUk, {
			expectLists: SMOKE_LISTS,
		});

		expect(breaches).toEqual([
			"UK_OFSI: expected in the live catalog but missing — screening would silently skip it",
		]);
	});

	it("fails an expected list that publishes zero entities", async () => {
		const empty = catalogWithUk(
			list({ id: "UK_OFSI", slug: "uk", entitiesCount: 0 }),
		);

		const breaches = await smokeBreaches(empty, { expectLists: SMOKE_LISTS });

		expect(breaches).toEqual([
			"UK_OFSI (uk): publishes 0 entities — an empty sanctions list screens nothing",
		]);
	});
});

describe("the freshness CLI in smoke mode", () => {
	it("parses --carry-ceiling-days and --expect-lists", () => {
		const args = parseFreshnessArgs([
			"--base-url",
			BASE,
			"--pubkey",
			"k",
			"--carry-ceiling-days",
			"7",
			"--expect-lists",
			"OFAC_SDN,EU_CONSOLIDATED,UN_CONSOLIDATED,UK_OFSI",
		]);

		expect(args.carryCeilingDays).toBe(7);
		expect(args.expectLists).toEqual([...SMOKE_LISTS]);
	});

	it("leaves both off by default so the scheduled gate stays strict", () => {
		const args = parseFreshnessArgs(["--base-url", BASE, "--pubkey", "k"]);

		expect(args.carryCeilingDays).toBeUndefined();
		expect(args.expectLists).toBeUndefined();
	});

	it.each([
		["a zero ceiling", ["--carry-ceiling-days", "0"]],
		["a fractional-garbage ceiling", ["--carry-ceiling-days", "a week"]],
		["an empty list set", ["--expect-lists", ""]],
		["a blank list id", ["--expect-lists", "OFAC_SDN,,UK_OFSI"]],
	])("rejects %s", (_label, extra) => {
		expect(() =>
			parseFreshnessArgs(["--base-url", BASE, "--pubkey", "k", ...extra]),
		).toThrow(FreshnessError);
	});

	it("threads both flags through to the live check", async () => {
		const lines: string[] = [];

		const report = await runCheckPublishedFreshness(
			[
				"--base-url",
				BASE,
				"--pubkey",
				"k",
				"--carry-ceiling-days",
				"7",
				"--expect-lists",
				SMOKE_LISTS.join(","),
			],
			{
				fetchBytes: fetchFrom(await signedOrigin(catalogWithUk(carriedUk(72)))),
				readFile: () => PUBKEY,
				log: (line) => lines.push(line),
				now,
			},
		);

		expect(report.lists).toHaveLength(4);
		expect(lines.join("\n")).toContain("carry ceiling 7d");
	});
});
