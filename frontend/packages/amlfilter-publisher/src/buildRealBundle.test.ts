// buildRealBundle's pure glue: fetch each configured source via its adapter,
// parse + map to wire entities, embed the canonical names, and shape one
// StagedList per required list whose fetchRaw and source-health checks succeed.
//
// A missing, empty, implausibly sized or stale feed no longer aborts the whole
// bundle: that list is re-served from the copy already published, marked stale
// with its real age, while every other list refreshes normally. It still aborts
// when a list can be neither refreshed NOR proven from the published bundle.
//
// The test injects FAKE sources (no network) and the FAKE embedder (no 23 MB
// model), so it exercises only the staging glue, never edge-proc and never a
// live fetch.

import { afterEach, describe, expect, test, vi } from "vitest";
import {
	BUNDLE_SOURCES,
	type CarryForward,
	parseRealBundleArgs,
	type RealBundleSourceSpec,
	stagedListsFromSources,
} from "./buildRealBundle.ts";
import { createFakeEmbedder } from "./fakeEmbedder.ts";
import {
	type AliasEnrichment,
	fetchNonLatinAliases,
} from "./sources/sdnAliases.ts";
import type {
	RawListBytes,
	SourceLine,
	WatchlistSource,
} from "./sources/source.ts";

const VERSION = "2026-06-23";
const NOW = new Date("2026-07-15T00:00:00.000Z");

const HEALTH = {
	minimumEntities: 1,
	maximumEntities: 2,
	maximumAgeMs: 30 * 24 * 60 * 60 * 1_000,
} as const;

/** A source whose fetchRaw resolves and parses to one PERSON line. */
function fakeSource(id: string, title: string, name: string): WatchlistSource {
	return {
		id,
		title,
		async fetchRaw(): Promise<RawListBytes> {
			return { "list.txt": name, updatedAt: "2026-07-01T00:00:00.000Z" };
		},
		sourceUpdatedAt(raw: RawListBytes): string | undefined {
			return raw.updatedAt;
		},
		parse(raw: RawListBytes, listVersion: string): SourceLine[] {
			const primary = raw["list.txt"] ?? "";
			return [
				{
					entity_id: `${id}:1`,
					primary_name: primary,
					entity_type: "PERSON",
					aliases: [{ name: `${primary} (aka)` }],
					dob: ["1980-01-02"],
					countries: ["US", "CA"],
					risk_category: "SANCTIONS",
					source_list: id,
					list_version: listVersion,
				},
			];
		},
	};
}

/** A source whose fetchRaw throws — stands in for a required upstream outage. */
function throwingSource(id: string, title: string): WatchlistSource {
	return {
		id,
		title,
		async fetchRaw(): Promise<RawListBytes> {
			throw new Error(`fetchRaw not wired for ${id}`);
		},
		parse(): SourceLine[] {
			return [];
		},
	};
}

const DIM = 384; // matches EMBEDDING_DIM the fake embedder produces.

describe("parseRealBundleArgs", () => {
	test("requires and parses the monotonic sequence", () => {
		expect(
			parseRealBundleArgs([
				"--version",
				"2026-07-15",
				"--sequence",
				"29433222924",
				"--key",
				"signing.key",
				"--out",
				"origin",
			]),
		).toMatchObject({ sequence: 29_433_222_924 });
	});

	test("rejects a missing or malformed sequence", () => {
		expect(() =>
			parseRealBundleArgs([
				"--version",
				"2026-07-15",
				"--key",
				"signing.key",
				"--out",
				"origin",
			]),
		).toThrow(/missing required --sequence/i);
		expect(() =>
			parseRealBundleArgs([
				"--version",
				"2026-07-15",
				"--sequence",
				"today",
				"--key",
				"signing.key",
				"--out",
				"origin",
			]),
		).toThrow(/sequence.*non-negative safe integer/i);
	});
});

describe("stagedListsFromSources", () => {
	const spec = (
		source: WatchlistSource,
		slug: string,
		health = HEALTH,
	): RealBundleSourceSpec => ({ source, slug, health });

	test("production requires OFAC, UN, EU, and UK with non-trivial bounds", () => {
		expect(BUNDLE_SOURCES.map(({ source }) => source.id)).toEqual([
			"OFAC_SDN",
			"UN_CONSOLIDATED",
			"EU_CONSOLIDATED",
			"UK_OFSI",
		]);
		for (const { source, health } of BUNDLE_SOURCES) {
			expect(source.sourceUpdatedAt).toBeTypeOf("function");
			expect(health.minimumEntities).toBeGreaterThan(1);
			expect(health.maximumEntities).toBeGreaterThan(health.minimumEntities);
			expect(health.maximumAgeMs).toBeGreaterThan(0);
		}
	});

	// The OFAC SDN population was counted independently on 2026-07-30 from
	// Commerce's CSL (19,181 rows) and from Treasury's own SDN_ADVANCED.XML
	// (19,181 <DistinctParty>), with entity ids agreeing 19,181/19,181. The band
	// must actually BRACKET that number, or a silently-broken filter could still
	// publish a fraction of the list as "plausible".
	test("brackets the cross-validated OFAC SDN population of 19,181", () => {
		const ofac = BUNDLE_SOURCES.find(({ source }) => source.id === "OFAC_SDN");
		const CROSS_VALIDATED_COUNT = 19_181;
		expect(ofac?.health.minimumEntities).toBeLessThan(CROSS_VALIDATED_COUNT);
		expect(ofac?.health.maximumEntities).toBeGreaterThan(CROSS_VALIDATED_COUNT);
		// Tight enough to catch a two-thirds-empty list, which the previous
		// 5,000 floor would have published without complaint.
		expect(ofac?.health.minimumEntities).toBeGreaterThan(
			CROSS_VALIDATED_COUNT * 0.6,
		);
		expect(ofac?.health.maximumEntities).toBeLessThan(
			CROSS_VALIDATED_COUNT * 2,
		);
	});

	// A capability whose only caller is its own test is built, not shipped. The
	// production OFAC spec must actually declare the enrichment, or every deploy
	// silently publishes Latin-only names while the unit tests stay green.
	test("WIRES non-Latin alias enrichment into the production OFAC source", () => {
		const ofac = BUNDLE_SOURCES.find(({ source }) => source.id === "OFAC_SDN");
		expect(ofac?.enrichAliases).toBeTypeOf("function");
		// …and only there: the other lists publish their own native scripts.
		for (const s of BUNDLE_SOURCES.filter((x) => x.source.id !== "OFAC_SDN")) {
			expect(s.enrichAliases).toBeUndefined();
		}
	});

	test("stages every healthy required source, in order", async () => {
		const specs: readonly RealBundleSourceSpec[] = [
			spec(fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich"), "ofac"),
			spec(fakeSource("UN_CONSOLIDATED", "UN Consolidated", "Jane Roe"), "un"),
		];
		const { lists: staged, aliases } = await stagedListsFromSources(
			specs,
			createFakeEmbedder(),
			VERSION,
			undefined,
			() => NOW,
		);
		expect(staged.map((l) => l.listId)).toEqual([
			"OFAC_SDN",
			"UN_CONSOLIDATED",
		]);
		expect(staged.map((l) => l.slug)).toEqual(["ofac", "un"]);
		expect(staged.map((l) => l.title)).toEqual(["OFAC SDN", "UN Consolidated"]);
		// No spec declared alias enrichment, so the bundle must NOT claim it.
		expect(aliases.mode).toBe("records-only");
	});

	test("maps source lines to wire entities and embeds canonical names", async () => {
		const specs: readonly RealBundleSourceSpec[] = [
			spec(fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich"), "ofac"),
		];
		const {
			lists: [list],
		} = await stagedListsFromSources(
			specs,
			createFakeEmbedder(),
			VERSION,
			undefined,
			() => NOW,
		);
		if (list === undefined) {
			throw new Error("expected one staged list");
		}
		expect(list.version).toBe(VERSION);
		expect(list.dim).toBe(DIM);
		expect(list.entities).toHaveLength(1);
		const entity = list.entities[0];
		if (entity === undefined) {
			throw new Error("expected one entity");
		}
		// toWatchlistEntity recomputes name_canonical via the shared canonicalize,
		// sorts countries, flattens alias names, and takes dob[0].
		expect(entity.entity_id).toBe("OFAC_SDN:1");
		expect(entity.name_canonical).toBe("ivan fakovich");
		expect(entity.aliases).toEqual(["Ivan Fakovich (aka)"]);
		expect(entity.dob).toBe("1980-01-02");
		expect(entity.countries).toEqual(["CA", "US"]);
		expect(entity.source_list).toBe("OFAC_SDN");
		expect(entity.list_version).toBe(VERSION);
		// One row of dim floats per entity.
		expect(list.vectors).toHaveLength(DIM);
	});

	// CONTRACT REVERSED (deliberately, see the sibling describe block below).
	// This test used to assert that ANY unfetchable feed aborted the whole
	// bundle. That coupling was the bug: the EU webgate 500ing blocked the OFAC
	// refresh, and OFAC is the list every visitor screens against by default.
	// The fail-closed half is preserved here — with no way to re-serve the
	// already-published copy, an unfetchable feed still aborts.
	test("fails closed when a source cannot be fetched AND cannot be carried", async () => {
		const specs: readonly RealBundleSourceSpec[] = [
			spec(fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich"), "ofac"),
			spec(throwingSource("EU_CONSOLIDATED", "EU Consolidated"), "eu"),
		];
		await expect(
			stagedListsFromSources(
				specs,
				createFakeEmbedder(),
				VERSION,
				undefined,
				() => NOW,
			),
		).rejects.toThrow(/EU_CONSOLIDATED.*required feed.*fetchRaw not wired/i);
	});

	test("records per-list freshness for a source this run DID refresh", async () => {
		const {
			lists: [list],
		} = await stagedListsFromSources(
			[spec(fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich"), "ofac")],
			createFakeEmbedder(),
			VERSION,
			undefined,
			() => NOW,
		);
		expect(list?.freshness).toEqual({
			fetchedAt: NOW.toISOString(),
			// The upstream's own stated publication instant, carried through
			// rather than discarded after the health check.
			sourceUpdatedAt: "2026-07-01T00:00:00.000Z",
			stale: false,
			staleReason: null,
		});
	});
	// THE COUPLING FIX. One flaky upstream must not age the lists that are healthy.
	/** Stands in for carryForwardList: hands back the last good published copy. */
	function carriedFrom(reasonSink: string[]): CarryForward {
		return (failed, reason) => {
			reasonSink.push(reason);
			return Promise.resolve({
				listId: failed.source.id,
				slug: failed.slug,
				title: failed.source.title,
				// The PUBLISHED version, not this run's — it was not rebuilt today.
				version: "2026-06-20",
				model: "Xenova/all-MiniLM-L6-v2",
				dim: DIM,
				entities: [],
				vectors: new Float32Array(0),
				freshness: {
					fetchedAt: "2026-06-20T06:00:00.000Z",
					sourceUpdatedAt: "2026-06-19T00:00:00.000Z",
					stale: true,
					staleReason: reason,
				},
			});
		};
	}

	test("carries the failed list forward and STILL refreshes the healthy ones", async () => {
		const reasons: string[] = [];
		const specs: readonly RealBundleSourceSpec[] = [
			spec(fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich"), "ofac"),
			spec(throwingSource("EU_CONSOLIDATED", "EU Consolidated"), "eu"),
		];
		const { lists, carried } = await stagedListsFromSources(
			specs,
			createFakeEmbedder(),
			VERSION,
			undefined,
			() => NOW,
			carriedFrom(reasons),
		);

		// Both lists are present — coverage is not silently withdrawn.
		expect(lists.map((l) => l.listId)).toEqual(["OFAC_SDN", "EU_CONSOLIDATED"]);

		// OFAC refreshed today, on time, despite EU being down. THIS is the fix.
		const ofac = lists.find((l) => l.listId === "OFAC_SDN");
		expect(ofac?.version).toBe(VERSION);
		expect(ofac?.freshness.stale).toBe(false);
		expect(ofac?.freshness.fetchedAt).toBe(NOW.toISOString());

		// EU kept its own, older identity and is marked stale with the real cause.
		const eu = lists.find((l) => l.listId === "EU_CONSOLIDATED");
		expect(eu?.version).toBe("2026-06-20");
		expect(eu?.freshness.stale).toBe(true);
		expect(eu?.freshness.fetchedAt).toBe("2026-06-20T06:00:00.000Z");
		expect(eu?.freshness.staleReason).toMatch(/fetchRaw not wired/);

		// The run reports what it could not refresh, so the deploy can say so.
		expect(carried).toHaveLength(1);
		expect(carried[0]?.listId).toBe("EU_CONSOLIDATED");
		expect(carried[0]?.fetchedAt).toBe("2026-06-20T06:00:00.000Z");
		expect(reasons[0]).toMatch(/required feed fetch failed/);
	});

	test("a run that refreshed everything reports nothing carried", async () => {
		const { carried } = await stagedListsFromSources(
			[spec(fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich"), "ofac")],
			createFakeEmbedder(),
			VERSION,
			undefined,
			() => NOW,
			carriedFrom([]),
		);
		expect(carried).toEqual([]);
	});

	// Fail-closed is preserved at the only point it still makes sense: we could
	// neither refresh the list nor prove the copy already published.
	test("aborts when the list can be neither refreshed nor re-served", async () => {
		const specs: readonly RealBundleSourceSpec[] = [
			spec(fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich"), "ofac"),
			spec(throwingSource("EU_CONSOLIDATED", "EU Consolidated"), "eu"),
		];
		await expect(
			stagedListsFromSources(
				specs,
				createFakeEmbedder(),
				VERSION,
				undefined,
				() => NOW,
				() => Promise.reject(new Error("published pointer failed to verify")),
			),
		).rejects.toThrow(
			/EU_CONSOLIDATED.*could not refresh.*could not re-serve/i,
		);
	});

	// A health-band or freshness rejection is a REFUSAL of bad upstream data, not
	// an outage. It must take the same carry-forward path — the alternative is
	// republishing a feed we just judged implausible.
	test("carries forward a source whose data failed its health band", async () => {
		const source = fakeSource("EU_CONSOLIDATED", "EU Consolidated", "x");
		source.parse = () => [];
		const { lists } = await stagedListsFromSources(
			[spec(source, "eu")],
			createFakeEmbedder(),
			VERSION,
			undefined,
			() => NOW,
			carriedFrom([]),
		);
		expect(lists[0]?.freshness.stale).toBe(true);
		expect(lists[0]?.freshness.staleReason).toMatch(/entity count 0/i);
	});

	test.each([
		["empty", 0, HEALTH, /entity count 0.*plausible range 1\.\.2/i],
		["too large", 3, HEALTH, /entity count 3.*plausible range 1\.\.2/i],
	])("rejects a %s required source", async (_label, count, health, message) => {
		const source = fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich");
		const originalParse = source.parse.bind(source);
		source.parse = (raw, version) =>
			Array.from(
				{ length: count as number },
				() => originalParse(raw, version)[0],
			).filter((line): line is SourceLine => line !== undefined);
		await expect(
			stagedListsFromSources(
				[spec(source, "ofac", health as typeof HEALTH)],
				createFakeEmbedder(),
				VERSION,
				undefined,
				() => NOW,
			),
		).rejects.toThrow(message as RegExp);
	});

	test.each([
		["missing", undefined, /freshness timestamp is missing/i],
		["invalid", "not-a-date", /freshness timestamp is invalid/i],
		["stale", "2026-01-01T00:00:00.000Z", /freshness.*exceeds.*30 days/i],
		["future", "2026-07-17T00:00:00.000Z", /freshness.*future/i],
	])("rejects a %s freshness timestamp", async (_label, updatedAt, message) => {
		const source = fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich");
		source.sourceUpdatedAt = () => updatedAt;
		await expect(
			stagedListsFromSources(
				[spec(source, "ofac")],
				createFakeEmbedder(),
				VERSION,
				undefined,
				() => NOW,
			),
		).rejects.toThrow(message as RegExp);
	});
});

// Alias enrichment is ADDITIVE and OPTIONAL. Records come from the record feed
// and are complete without it, so a mirror outage must degrade the bundle
// (fewer aliases) rather than fail the deploy — the same trade-off
// mirrorPublishedOrigin makes. What it must never do is stay quiet about it.
describe("alias enrichment degrades loudly instead of failing the build", () => {
	const spec = (
		source: WatchlistSource,
		slug: string,
		enrichAliases?: () => Promise<AliasEnrichment>,
	): RealBundleSourceSpec => ({
		source,
		slug,
		health: HEALTH,
		...(enrichAliases === undefined ? {} : { enrichAliases }),
	});

	const stage = (specs: readonly RealBundleSourceSpec[]) =>
		stagedListsFromSources(
			specs,
			createFakeEmbedder(),
			VERSION,
			undefined,
			() => NOW,
		);

	test("reports `enriched` and appends the extra aliases", async () => {
		const { lists, aliases } = await stage([
			spec(fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich"), "ofac", () =>
				Promise.resolve({
					byEntityNumber: new Map([["1", ["Иван Факович"]]]),
					aliasesFound: 1,
					byScript: new Map([["Cyrillic", 1]]),
				}),
			),
		]);

		expect(aliases.mode).toBe("enriched");
		expect(aliases.aliasesAdded).toBe(1);
		expect(aliases.entitiesEnriched).toBe(1);
		expect(lists[0]?.entities[0]?.aliases).toContain("Иван Факович");
	});

	test("an unreachable mirror still publishes, marked `records-only`", async () => {
		const { lists, aliases } = await stage([
			spec(fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich"), "ofac", () =>
				Promise.reject(new Error("mirror unreachable: 503")),
			),
		]);

		// The bundle EXISTS — a third-party mirror cannot block a release.
		expect(lists).toHaveLength(1);
		expect(lists[0]?.entities).toHaveLength(1);
		// …but it does not pretend to have coverage it lacks.
		expect(aliases.mode).toBe("records-only");
		expect(aliases.aliasesAdded).toBe(0);
		expect(aliases.reason).toMatch(/mirror unreachable: 503/);
	});

	test("one degraded source degrades the WHOLE bundle's claim", async () => {
		const { aliases } = await stage([
			spec(fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich"), "ofac", () =>
				Promise.resolve({
					byEntityNumber: new Map([["1", ["Иван Факович"]]]),
					aliasesFound: 1,
					byScript: new Map([["Cyrillic", 1]]),
				}),
			),
			spec(fakeSource("UN_CONSOLIDATED", "UN", "Jane Roe"), "un", () =>
				Promise.reject(new Error("boom")),
			),
		]);

		// A partial run must never be describable as fully enriched.
		expect(aliases.mode).toBe("records-only");
	});

	test("enrichment cannot change the record population", async () => {
		// Aliases for an entity that does not exist must not create one.
		const { lists, aliases } = await stage([
			spec(fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich"), "ofac", () =>
				Promise.resolve({
					byEntityNumber: new Map([["999999", ["Призрак"]]]),
					aliasesFound: 1,
					byScript: new Map([["Cyrillic", 1]]),
				}),
			),
		]);
		expect(lists[0]?.entities).toHaveLength(1);
		expect(aliases.aliasesAdded).toBe(0);
	});
});

// End-to-end through the REAL enrichment code path — not a mocked rejection.
// A heap OOM would be uncatchable and kill the deploy; the size cap converts
// that class of failure into an ordinary error the fail-soft path can absorb.
describe("the bundle survives a REAL alias-feed failure", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	test("an oversized mirror still publishes, marked records-only", async () => {
		const huge = `<Sanctions><ScriptValues><Script ID="220">Cyrillic</Script></ScriptValues>${"<pad/>".repeat(100_000)}`;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (): Promise<Response> => new Response(huge, { status: 200 })),
		);

		const { lists, aliases } = await stagedListsFromSources(
			[
				{
					source: fakeSource("OFAC_SDN", "OFAC SDN", "Ivan Fakovich"),
					slug: "ofac",
					health: HEALTH,
					// The real fetch + real streaming parser, with a tiny cap.
					enrichAliases: () => fetchNonLatinAliases({ maxBytes: 4_096 }),
				},
			],
			createFakeEmbedder(),
			VERSION,
			undefined,
			() => NOW,
		);

		// The deploy is NOT held hostage: the bundle exists.
		expect(lists).toHaveLength(1);
		expect(lists[0]?.entities).toHaveLength(1);
		// …and it says what it is.
		expect(aliases.mode).toBe("records-only");
		expect(aliases.reason).toMatch(/exceeded/i);
	});
});
