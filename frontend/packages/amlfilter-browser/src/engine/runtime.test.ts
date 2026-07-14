import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BundleSource } from "./bundleSource";
import type { Embedder, EmbedProgress } from "./embedder";
import {
	BOOT_TIMEOUT_MS,
	type BootStage,
	bootTimeoutMs,
	compositeVersion,
	configFromEnv,
	defaultRuntimeDeps,
	EngineRuntime,
	MODEL_LOAD_TIMEOUT_MS,
	modelLoadTimeoutMs,
	parseTimeoutMs,
	type RuntimeConfig,
	type RuntimeDeps,
	throttleByRoundedPct,
	withTimeout,
} from "./runtime";
import { VectorIndex } from "./vectorIndex";
import type {
	LoadedWatchlist,
	WatchlistCatalog,
	WatchlistCatalogEntry,
} from "./watchlist";

const PUBKEY = new Uint8Array(32);

/** Build a list's loaded watchlist for a given catalog entry. */
type LoadedFor = (entry: WatchlistCatalogEntry) => LoadedWatchlist;

/** A fake {@link BundleSource} whose loaders resolve to the same fakes the old
 * JSON `loadCatalog`/`loadList` deps returned — the bundle path is now the ONLY
 * path, so the runtime is driven through `openBundleSource`. `onCatalog` (when
 * given) lets a test track/intercept each catalog read; `clear` is a no-op. */
function fakeBundleSource(
	catalog: WatchlistCatalog,
	loadedFor: LoadedFor,
): BundleSource {
	return {
		loadCatalog: () => catalog,
		loadList: (entry) => Promise.resolve(loadedFor(entry)),
		version: () => "fake",
		clear: () => Promise.resolve(),
	};
}

/** An `openBundleSource` dep that opens a source over the catalog drawn from a
 * queue (boot then each reload/poll, since the runtime re-opens after nulling
 * its memo), building lists via `loadedFor`. Advances the queue per open. */
function bundleSourceFromCatalogs(
	catalogs: ReadonlyArray<WatchlistCatalog>,
	loadedFor: LoadedFor,
	onOpen?: () => void,
): RuntimeDeps["openBundleSource"] {
	let opens = 0;
	return () => {
		onOpen?.();
		const catalog = catalogs[Math.min(opens, catalogs.length - 1)];
		opens += 1;
		return Promise.resolve(
			fakeBundleSource(catalog as WatchlistCatalog, loadedFor),
		);
	};
}

/** A catalog entry for `listId`, dir prefix derived from a lowercased id. */
function entryFor(listId: string, version: string): WatchlistCatalogEntry {
	return {
		id: listId,
		title: listId,
		version,
		entitiesCount: 1,
		path: `${listId.toLowerCase()}/`,
	};
}

/** A catalog over the given (listId, version) pairs. */
function catalogOf(
	pairs: ReadonlyArray<readonly [string, string]>,
): WatchlistCatalog {
	return {
		schema: 1,
		generatedAt: "2026-06-19T00:00:00Z",
		lists: pairs.map(([id, v]) => entryFor(id, v)),
	};
}

beforeEach(() => {
	// The bundle path verifies the pinned pubkey inside the (faked) bundle source,
	// so the main thread never fetches here; stub fetch defensively so any stray
	// same-origin read resolves with deterministic bytes rather than hitting the
	// network in the test environment.
	vi.stubGlobal(
		"fetch",
		vi.fn(() => Promise.resolve(new Response(PUBKEY, { status: 200 }))),
	);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const CONFIG: RuntimeConfig = {
	pubkeyUrl: "https://app.example/public.key",
	bundleBaseUrl: "/bundle/origin",
};

/** A trivial loaded watchlist whose index/entities are never reached when
 * warmup hangs or rejects. */
function fakeLoaded(): LoadedWatchlist {
	return {
		index: new VectorIndex(new Float32Array(1), ["x"], 1),
		entities: new Map(),
		version: "test",
		listId: "OFAC_SDN",
	};
}

/** An embedder whose embed() never settles — the boot-hang condition. */
function neverEmbedder(): Embedder {
	return { embed: () => new Promise<Float32Array>(() => {}) };
}

/** A single-catalog `openBundleSource` over the given (listId, version) pairs,
 * each list loaded as a trivial {@link fakeLoaded}. The bundle path is the ONLY
 * path, so bootstrap is always driven through this. */
function bundleSourceOf(
	pairs: ReadonlyArray<readonly [string, string]>,
): RuntimeDeps["openBundleSource"] {
	return bundleSourceFromCatalogs([catalogOf(pairs)], () => fakeLoaded());
}

describe("parseTimeoutMs (model-load timeout override, fail-closed)", () => {
	it("returns the production default when the override is absent", () => {
		expect(parseTimeoutMs(undefined)).toBe(MODEL_LOAD_TIMEOUT_MS);
	});

	it("uses a valid positive numeric override", () => {
		expect(parseTimeoutMs("2500")).toBe(2500);
	});

	it.each([
		"",
		"abc",
		"0",
		"-1",
		"NaN",
		"Infinity",
	])("falls back to the default for the invalid override %p", (raw) => {
		expect(parseTimeoutMs(raw)).toBe(MODEL_LOAD_TIMEOUT_MS);
	});

	it("reads VITE_MODEL_LOAD_TIMEOUT_MS from the env record", () => {
		expect(modelLoadTimeoutMs({ VITE_MODEL_LOAD_TIMEOUT_MS: "1234" })).toBe(
			1234,
		);
	});

	it("falls back to the default when the env var is unset", () => {
		expect(modelLoadTimeoutMs({})).toBe(MODEL_LOAD_TIMEOUT_MS);
	});
});

describe("bootTimeoutMs (overall boot deadline override, fail-closed)", () => {
	it("defaults to BOOT_TIMEOUT_MS when the env var is unset", () => {
		expect(bootTimeoutMs({})).toBe(BOOT_TIMEOUT_MS);
	});

	it("uses a valid positive override and falls back for an invalid one", () => {
		expect(bootTimeoutMs({ VITE_BOOT_TIMEOUT_MS: "5000" })).toBe(5000);
		expect(bootTimeoutMs({ VITE_BOOT_TIMEOUT_MS: "-1" })).toBe(BOOT_TIMEOUT_MS);
	});

	it("is longer than the model-load ceiling so the model timeout stays the tighter bound", () => {
		expect(BOOT_TIMEOUT_MS).toBeGreaterThan(MODEL_LOAD_TIMEOUT_MS);
	});
});

describe("EngineRuntime overall boot timeout", () => {
	it("rejects the whole boot when the download phase stalls past the deadline", async () => {
		const deps: RuntimeDeps = {
			makeEmbedder: () => neverEmbedder(),
			clearCache: () => Promise.resolve(),
			// A bundle open that never settles — the download/verify phase hangs
			// forever, the exact "sits on Downloading… forever" shape on iOS.
			openBundleSource: () => new Promise<BundleSource>(() => {}),
		};
		const runtime = new EngineRuntime(deps);
		vi.useFakeTimers();
		const pending = runtime.bootstrap(CONFIG);
		const assertion = expect(pending).rejects.toThrow(/timed out/i);
		await vi.advanceTimersByTimeAsync(BOOT_TIMEOUT_MS);
		await assertion;
		// The boot-timeout rejection flows through the SAME memo-clearing catch a
		// build rejection does (covered by "a failed bundle open clears the memo"),
		// so a later Retry re-attempts the boot.
	});
});

describe("withTimeout", () => {
	it("passes through the value of a promise that settles before the deadline", async () => {
		await expect(withTimeout(Promise.resolve(42), 1000, "nope")).resolves.toBe(
			42,
		);
	});

	it("rejects with the message when the inner promise never settles", async () => {
		vi.useFakeTimers();
		const pending = withTimeout(
			new Promise<number>(() => {}),
			5000,
			"warmup stalled",
		);
		const assertion = expect(pending).rejects.toThrow("warmup stalled");
		await vi.advanceTimersByTimeAsync(5000);
		await assertion;
	});

	it("does not reject after the inner promise already resolved", async () => {
		vi.useFakeTimers();
		const resolved = withTimeout(
			Promise.resolve("ok"),
			5000,
			"should not fire",
		);
		await expect(resolved).resolves.toBe("ok");
		// Advancing past the deadline must not produce an unhandled rejection.
		await vi.advanceTimersByTimeAsync(5000);
	});
});

describe("EngineRuntime bootstrap timeout", () => {
	function deps(embedder: Embedder): RuntimeDeps {
		return {
			makeEmbedder: () => embedder,
			clearCache: () => Promise.resolve(),
			openBundleSource: bundleSourceOf([["OFAC_SDN", "test"]]),
		};
	}

	it("rejects with the model-load timeout message when warmup never settles", async () => {
		vi.useFakeTimers();
		const runtime = new EngineRuntime(deps(neverEmbedder()));
		const pending = runtime.bootstrap(CONFIG);
		const assertion = expect(pending).rejects.toThrow(/model/i);
		await vi.advanceTimersByTimeAsync(MODEL_LOAD_TIMEOUT_MS);
		await assertion;
	});

	it("clears the memo on timeout so a later boot re-attempts the warmup", async () => {
		vi.useFakeTimers();
		// Both warmups hang; we only assert that #build re-ran (embed called
		// again), which is impossible unless the rejected memo was cleared.
		const embed = vi
			.fn<Embedder["embed"]>()
			.mockImplementation(() => new Promise<Float32Array>(() => {}));
		const runtime = new EngineRuntime(deps({ embed }));

		const first = runtime.bootstrap(CONFIG);
		const firstAssert = expect(first).rejects.toThrow();
		await vi.advanceTimersByTimeAsync(MODEL_LOAD_TIMEOUT_MS);
		await firstAssert;
		expect(embed).toHaveBeenCalledTimes(1);

		const second = runtime.bootstrap(CONFIG);
		const secondAssert = expect(second).rejects.toThrow();
		await vi.advanceTimersByTimeAsync(MODEL_LOAD_TIMEOUT_MS);
		await secondAssert;
		// A fresh #build ran (warmup re-attempted) — the rejected memo was cleared.
		expect(embed).toHaveBeenCalledTimes(2);
	});
});

describe("EngineRuntime.reload", () => {
	/** A loaded watchlist tagged with a listId + version + a single entity id. */
	function loadedAt(
		version: string,
		entityId: string,
		listId = "OFAC_SDN",
	): LoadedWatchlist {
		return {
			index: new VectorIndex(new Float32Array(1), [entityId], 1),
			entities: new Map([
				[
					entityId,
					{
						entity_id: entityId,
						entity_type: "PERSON",
						primary_name: entityId,
						name_canonical: entityId,
						aliases: [],
						dob: [],
						countries: [],
						risk_category: "SANCTION",
						source_list: listId,
						list_version: version,
					},
				],
			]),
			version,
			listId,
		};
	}

	/** An embedder that resolves instantly so bootstrap completes (no fake timers). */
	function instantEmbedder(): Embedder {
		return { embed: () => Promise.resolve(new Float32Array(1)) };
	}

	/** Deps whose bundle source loads a `<listId>:E@<version>` loaded watchlist per
	 * catalog entry, with the catalog drawn from a queue (boot then each reopen —
	 * reload/poll null the runtime's memo and re-open the source). */
	function depsForCatalogs(catalogs: ReadonlyArray<WatchlistCatalog>): {
		deps: RuntimeDeps;
		makeEmbedder: ReturnType<typeof vi.fn>;
	} {
		const makeEmbedder = vi.fn(() => instantEmbedder());
		const deps: RuntimeDeps = {
			makeEmbedder,
			clearCache: () => Promise.resolve(),
			openBundleSource: bundleSourceFromCatalogs(catalogs, (entry) =>
				loadedAt(entry.version, `${entry.id}:E`, entry.id),
			),
		};
		return { deps, makeEmbedder };
	}

	it("loads EVERY catalog list and stamps the composite version", async () => {
		const { deps } = depsForCatalogs([
			catalogOf([
				["EU_CONSOLIDATED", "demo-1"],
				["OFAC_SDN", "demo-1"],
			]),
		]);
		const runtime = new EngineRuntime(deps);
		const engine = await runtime.bootstrap(CONFIG);
		// Both lists' entities are present (browse view spans lists).
		expect(
			engine
				.allEntities()
				.map((e) => e.entity_id)
				.sort(),
		).toEqual(["EU_CONSOLIDATED:E", "OFAC_SDN:E"]);
		// Composite stamp: sorted id@version join.
		expect(runtime.version()).toBe("EU_CONSOLIDATED@demo-1|OFAC_SDN@demo-1");
	});

	it("rejects the WHOLE bootstrap if ANY single list fails to load (fail-closed)", async () => {
		const makeEmbedder = vi.fn(() => instantEmbedder());
		const catalog = catalogOf([
			["EU_CONSOLIDATED", "demo-1"],
			["OFAC_SDN", "demo-1"],
		]);
		const runtime = new EngineRuntime({
			makeEmbedder,
			clearCache: () => Promise.resolve(),
			openBundleSource: () =>
				Promise.resolve({
					loadCatalog: () => catalog,
					loadList: (entry) =>
						entry.id === "OFAC_SDN"
							? Promise.reject(new Error("signature verification failed"))
							: Promise.resolve(loadedAt(entry.version, `${entry.id}:E`)),
					version: () => "fake",
					clear: () => Promise.resolve(),
				}),
		});
		await expect(runtime.bootstrap(CONFIG)).rejects.toThrow(/verification/);
		// No partial engine was published.
		expect(runtime.engine()).toBeNull();
		// A bad list must NOT have reached the (~23 MB) model warmup.
		expect(makeEmbedder).not.toHaveBeenCalled();
	});

	it("reload re-loads every list, reuses the warm embedder, and advances the composite", async () => {
		const { deps, makeEmbedder } = depsForCatalogs([
			catalogOf([["OFAC_SDN", "demo-1"]]),
			catalogOf([["OFAC_SDN", "demo-2"]]),
		]);
		const runtime = new EngineRuntime(deps);

		const first = await runtime.bootstrap(CONFIG);
		expect(runtime.version()).toBe("OFAC_SDN@demo-1");

		const reloaded = await runtime.reload();
		expect(runtime.version()).toBe("OFAC_SDN@demo-2");
		expect(reloaded.listVersions()).toEqual({ OFAC_SDN: "demo-2" });
		expect(runtime.engine()).toBe(reloaded);
		expect(runtime.engine()).not.toBe(first);
		// The embedder was built ONCE (at bootstrap) — reload did NOT re-download.
		expect(makeEmbedder).toHaveBeenCalledTimes(1);
	});

	it("fetchPublishedVersion returns a DIFFERENT composite when a list version bumps", async () => {
		// Boot opens the source over demo-1; fetchPublishedVersion nulls the memo
		// and re-opens, drawing the bumped demo-2 catalog from the queue.
		const { deps } = depsForCatalogs([
			catalogOf([["OFAC_SDN", "demo-1"]]),
			catalogOf([["OFAC_SDN", "demo-2"]]),
		]);
		const runtime = new EngineRuntime(deps);
		await runtime.bootstrap(CONFIG);
		const published = await runtime.fetchPublishedVersion();
		expect(runtime.version()).toBe("OFAC_SDN@demo-1");
		expect(published).toBe("OFAC_SDN@demo-2");
		expect(published).not.toBe(runtime.version());
	});

	it("throws if reload is called before a successful bootstrap", async () => {
		const { deps } = depsForCatalogs([catalogOf([["OFAC_SDN", "demo-1"]])]);
		const runtime = new EngineRuntime(deps);
		await expect(runtime.reload()).rejects.toThrow();
	});

	it("throws if fetchPublishedVersion is called before a successful bootstrap", async () => {
		const { deps } = depsForCatalogs([catalogOf([["OFAC_SDN", "demo-1"]])]);
		const runtime = new EngineRuntime(deps);
		await expect(runtime.fetchPublishedVersion()).rejects.toThrow();
	});
});

describe("EngineRuntime enabledLists selection + thresholds", () => {
	function loadedAt(
		version: string,
		entityId: string,
		listId: string,
	): LoadedWatchlist {
		return {
			index: new VectorIndex(new Float32Array(1), [entityId], 1),
			entities: new Map([
				[
					entityId,
					{
						entity_id: entityId,
						entity_type: "PERSON",
						primary_name: entityId,
						name_canonical: entityId,
						aliases: [],
						dob: [],
						countries: [],
						risk_category: "SANCTION",
						source_list: listId,
						list_version: version,
					},
				],
			]),
			version,
			listId,
		};
	}

	function instantEmbedder(): Embedder {
		return { embed: () => Promise.resolve(new Float32Array(1)) };
	}

	/** Deps over a static multi-list catalog; the bundle source's loadList tracks
	 * which ids loaded (the runtime filters to the enabled set before loading). */
	function depsFor(catalog: WatchlistCatalog): {
		deps: RuntimeDeps;
		loadedIds: string[];
		makeEmbedder: ReturnType<typeof vi.fn>;
	} {
		const loadedIds: string[] = [];
		const makeEmbedder = vi.fn(() => instantEmbedder());
		const deps: RuntimeDeps = {
			makeEmbedder,
			clearCache: () => Promise.resolve(),
			openBundleSource: bundleSourceFromCatalogs([catalog], (entry) => {
				loadedIds.push(entry.id);
				return loadedAt(entry.version, `${entry.id}:E`, entry.id);
			}),
		};
		return { deps, loadedIds, makeEmbedder };
	}

	const MULTI = catalogOf([
		["EU_CONSOLIDATED", "demo-1"],
		["OFAC_SDN", "demo-1"],
		["UN_CONSOLIDATED", "demo-1"],
	]);

	it("loads only the enabled subset of catalog lists", async () => {
		const { deps, loadedIds } = depsFor(MULTI);
		const runtime = new EngineRuntime(deps);
		const engine = await runtime.bootstrap(CONFIG, () => {}, {
			enabledLists: ["OFAC_SDN", "UN_CONSOLIDATED"],
		});
		expect(loadedIds.sort()).toEqual(["OFAC_SDN", "UN_CONSOLIDATED"]);
		expect(
			engine
				.allEntities()
				.map((e) => e.entity_id)
				.sort(),
		).toEqual(["OFAC_SDN:E", "UN_CONSOLIDATED:E"]);
		expect(runtime.version()).toBe("OFAC_SDN@demo-1|UN_CONSOLIDATED@demo-1");
	});

	it("loads every list when enabledLists is absent (today's behavior)", async () => {
		const { deps, loadedIds } = depsFor(MULTI);
		const runtime = new EngineRuntime(deps);
		await runtime.bootstrap(CONFIG);
		expect(loadedIds.sort()).toEqual([
			"EU_CONSOLIDATED",
			"OFAC_SDN",
			"UN_CONSOLIDATED",
		]);
	});

	it("silently skips an enabled id that is absent from the catalog", async () => {
		const { deps, loadedIds } = depsFor(MULTI);
		const runtime = new EngineRuntime(deps);
		await runtime.bootstrap(CONFIG, () => {}, {
			enabledLists: ["OFAC_SDN", "NOT_IN_CATALOG"],
		});
		expect(loadedIds).toEqual(["OFAC_SDN"]);
	});

	it("loads nothing and screens to no matches for an empty enabled set", async () => {
		const { deps, loadedIds, makeEmbedder } = depsFor(MULTI);
		const runtime = new EngineRuntime(deps);
		const engine = await runtime.bootstrap(CONFIG, () => {}, {
			enabledLists: [],
		});
		expect(loadedIds).toEqual([]);
		expect(engine.allEntities()).toEqual([]);
		// The embedder still warms (model load is selection-independent).
		expect(makeEmbedder).toHaveBeenCalledTimes(1);
		const res = await engine.screen({ name: "anyone" });
		expect(res.matches).toEqual([]);
	});

	it("exposes the catalog list ids (the real selectable set)", async () => {
		const { deps } = depsFor(MULTI);
		const runtime = new EngineRuntime(deps);
		await runtime.bootstrap(CONFIG);
		expect([...(await runtime.catalogListIds())].sort()).toEqual([
			"EU_CONSOLIDATED",
			"OFAC_SDN",
			"UN_CONSOLIDATED",
		]);
	});

	it("re-bootstrap reloads a new enabled set, reusing the warm embedder", async () => {
		const { deps, loadedIds, makeEmbedder } = depsFor(MULTI);
		const runtime = new EngineRuntime(deps);
		await runtime.bootstrap(CONFIG, () => {}, {
			enabledLists: ["OFAC_SDN"],
		});
		expect(loadedIds).toEqual(["OFAC_SDN"]);

		const re = await runtime.reload({
			enabledLists: ["EU_CONSOLIDATED", "OFAC_SDN"],
		});
		expect(re.listVersions()).toEqual({
			EU_CONSOLIDATED: "demo-1",
			OFAC_SDN: "demo-1",
		});
		expect(runtime.engine()).toBe(re);
		// The embedder was built ONCE — re-bootstrap did NOT re-download the model.
		expect(makeEmbedder).toHaveBeenCalledTimes(1);
	});

	it("passes thresholds through to the engine (a strict per-list bar suppresses)", async () => {
		const { deps } = depsFor(MULTI);
		const runtime = new EngineRuntime(deps);
		// Every list's entity vector is identical to the (axis) embed; only the
		// per-list bar differs. OFAC's impossibly-high bar suppresses its hit.
		const engine = await runtime.bootstrap(CONFIG, () => {}, {
			thresholds: { default: 0, perList: { OFAC_SDN: 1.0001 } },
		});
		const ids = (
			await engine.screen({ name: "EU_CONSOLIDATED:E" })
		).matches.map((m) => m.entity_id);
		expect(ids).not.toContain("OFAC_SDN:E");
	});
});

describe("compositeVersion", () => {
	it("sorts by id and joins id@version with a pipe", () => {
		expect(
			compositeVersion({ OFAC_SDN: "demo-1", EU_CONSOLIDATED: "demo-1" }),
		).toBe("EU_CONSOLIDATED@demo-1|OFAC_SDN@demo-1");
	});

	it("is empty for no lists", () => {
		expect(compositeVersion({})).toBe("");
	});
});

describe("throttleByRoundedPct", () => {
	function progress(pct: number): EmbedProgress {
		return { loaded: pct, total: 100, pct };
	}

	it("emits once for repeated ticks at the same rounded percent", () => {
		const emit = vi.fn();
		const throttled = throttleByRoundedPct(emit);
		// Four sub-percent ticks that all round to 42 → exactly one emit.
		throttled(progress(42.0));
		throttled(progress(42.1));
		throttled(progress(42.4));
		throttled(progress(41.7)); // still rounds to 42
		expect(emit).toHaveBeenCalledTimes(1);
	});

	it("emits again when the rounded percent changes, forwarding precise pct", () => {
		const emit = vi.fn();
		const throttled = throttleByRoundedPct(emit);
		throttled(progress(42.2));
		throttled(progress(43.1)); // rounds to 43 → a new emit
		expect(emit).toHaveBeenCalledTimes(2);
		// The precise pct is forwarded unchanged (the banner rounds for display).
		expect(emit).toHaveBeenNthCalledWith(2, progress(43.1));
	});

	it("caps emissions at ~101 over a full 0→100 sub-percent stream", () => {
		const emit = vi.fn();
		const throttled = throttleByRoundedPct(emit);
		// 1000 ticks evenly from 0 to 100 → at most 101 distinct rounded values.
		for (let i = 0; i <= 1000; i += 1) {
			throttled(progress((i / 1000) * 100));
		}
		expect(emit.mock.calls.length).toBeLessThanOrEqual(101);
	});
});

describe("EngineRuntime boot stages", () => {
	it("emits downloading then verified(version) before loading the model", async () => {
		const deps: RuntimeDeps = {
			makeEmbedder: () => neverEmbedder(),
			clearCache: () => Promise.resolve(),
			openBundleSource: bundleSourceOf([["OFAC_SDN", "test"]]),
		};
		const runtime = new EngineRuntime(deps);
		const stages: BootStage[] = [];
		vi.useFakeTimers();
		const pending = runtime.bootstrap(CONFIG, (s) => stages.push(s));
		const assertion = expect(pending).rejects.toThrow();
		// Let the (real-timer) fetch + load microtasks flush before the deadline.
		await vi.advanceTimersByTimeAsync(MODEL_LOAD_TIMEOUT_MS);
		await assertion;
		expect(stages[0]).toEqual({ kind: "downloading" });
		// The verified stage carries the COMPOSITE stamp, not a bare version.
		expect(stages).toContainEqual({
			kind: "verified",
			version: "OFAC_SDN@test",
		});
	});

	it("threads cold-sync download progress into a downloading stage", async () => {
		// The bundle-open dep receives an onSyncProgress sink (4th arg); this fake
		// fires one tick during the sync, then the warmup rejects to halt #build —
		// proving the download progress reached onStage as a downloading stage.
		const deps: RuntimeDeps = {
			makeEmbedder: () => ({
				embed: () => Promise.reject(new Error("warmup halted after progress")),
			}),
			clearCache: () => Promise.resolve(),
			openBundleSource: (_baseUrl, _pubkeyUrl, _bundleDeps, onProgress) => {
				onProgress?.({ fetched: 3, total: 10, bytes: 300 });
				return Promise.resolve(
					fakeBundleSource(catalogOf([["OFAC_SDN", "test"]]), () =>
						fakeLoaded(),
					),
				);
			},
		};
		const runtime = new EngineRuntime(deps);
		const stages: BootStage[] = [];
		await expect(
			runtime.bootstrap(CONFIG, (s) => stages.push(s)),
		).rejects.toThrow("warmup halted after progress");

		// The plain downloading stage fires first (no progress yet)...
		expect(stages[0]).toEqual({ kind: "downloading" });
		// ...then the per-chunk progress rides a later downloading stage.
		expect(stages).toContainEqual({
			kind: "downloading",
			progress: { fetched: 3, total: 10, bytes: 300 },
		});
	});

	it("threads an embedder progress event into a loading-model stage", async () => {
		// The embedder factory receives an onProgress sink; this fake fires one
		// progress event during warmup, which the runtime must surface as a
		// loading-model BootStage carrying that progress.
		const deps: RuntimeDeps = {
			makeEmbedder: (onProgress) => ({
				// Fire one progress tick, then reject — that halts #build before the
				// (out-of-scope) screening-engine assembly while still proving the
				// progress sink reached onStage. The rejection is asserted below.
				embed: () => {
					onProgress({ loaded: 12, total: 24, pct: 50 });
					return Promise.reject(new Error("warmup halted after progress"));
				},
			}),
			clearCache: () => Promise.resolve(),
			openBundleSource: bundleSourceOf([["OFAC_SDN", "test"]]),
		};
		const runtime = new EngineRuntime(deps);
		const stages: BootStage[] = [];
		await expect(
			runtime.bootstrap(CONFIG, (s) => stages.push(s)),
		).rejects.toThrow("warmup halted after progress");

		expect(stages).toContainEqual({
			kind: "loading-model",
			progress: { loaded: 12, total: 24, pct: 50 },
		});
		// The plain (progress-less) loading-model stage still fires first.
		expect(stages).toContainEqual({ kind: "loading-model" });
	});
});

describe("EngineRuntime.clearListCache + cache-aware deps", () => {
	function instantEmbedder(): Embedder {
		return { embed: () => Promise.resolve(new Float32Array(1)) };
	}

	it("clearListCache delegates to the injected cache-clear seam", async () => {
		const clearCache = vi.fn(() => Promise.resolve());
		const runtime = new EngineRuntime({
			makeEmbedder: () => instantEmbedder(),
			clearCache,
			openBundleSource: bundleSourceOf([["OFAC_SDN", "v"]]),
		});
		await runtime.clearListCache();
		expect(clearCache).toHaveBeenCalledTimes(1);
	});

	it("defaultRuntimeDeps exposes a clearCache seam (cache-aware by default)", () => {
		expect(typeof defaultRuntimeDeps().clearCache).toBe("function");
	});
});

describe("configFromEnv", () => {
	it("defaults the bundle base URL and pins the pubkey same-origin", () => {
		const config = configFromEnv({});
		expect(config.bundleBaseUrl).toBe("/bundle/origin");
		expect(config.pubkeyUrl).toBe(
			new URL("public.key", document.baseURI).toString(),
		);
	});

	it("VITE_BUNDLE_BASE_URL overrides the default bundle origin", () => {
		const config = configFromEnv({
			VITE_BUNDLE_BASE_URL: "https://cdn.example/bundle",
		});
		expect(config.bundleBaseUrl).toBe("https://cdn.example/bundle");
	});

	it("a whitespace-only override falls back to the default (fail-closed)", () => {
		expect(configFromEnv({ VITE_BUNDLE_BASE_URL: "   " }).bundleBaseUrl).toBe(
			"/bundle/origin",
		);
	});
});

describe("EngineRuntime bootstrap memo + bundle-source retry", () => {
	function instantEmbedder(): Embedder {
		return { embed: () => Promise.resolve(new Float32Array(384)) };
	}

	it("bootstrap is idempotent: a second call reuses the first engine", async () => {
		let opens = 0;
		const deps: RuntimeDeps = {
			makeEmbedder: () => instantEmbedder(),
			clearCache: () => Promise.resolve(),
			openBundleSource: bundleSourceFromCatalogs(
				[catalogOf([["OFAC_SDN", "1"]])],
				() => fakeLoaded(),
				() => {
					opens += 1;
				},
			),
		};
		const runtime = new EngineRuntime(deps);
		const first = await runtime.bootstrap(CONFIG);
		const second = await runtime.bootstrap(CONFIG);
		expect(second).toBe(first);
		// ONE delta-sync served both calls — the memo held.
		expect(opens).toBe(1);
	});

	it("a failed bundle open clears the memo so a later bootstrap retries", async () => {
		let calls = 0;
		const good = bundleSourceOf([["OFAC_SDN", "1"]]);
		const deps: RuntimeDeps = {
			makeEmbedder: () => instantEmbedder(),
			clearCache: () => Promise.resolve(),
			openBundleSource: (baseUrl, pubkeyUrl) => {
				calls += 1;
				if (calls === 1) {
					return Promise.reject(new Error("bundle origin unreachable"));
				}
				return good(baseUrl, pubkeyUrl);
			},
		};
		const runtime = new EngineRuntime(deps);
		await expect(runtime.bootstrap(CONFIG)).rejects.toThrow(
			/bundle origin unreachable/,
		);
		// Both memos (engine promise + bundle source) were cleared: the retry
		// re-opens the bundle instead of replaying the failed promise.
		await expect(runtime.bootstrap(CONFIG)).resolves.toBeDefined();
		expect(calls).toBe(2);
	});

	it("catalogLists before a successful bootstrap throws", async () => {
		const runtime = new EngineRuntime({
			makeEmbedder: () => instantEmbedder(),
			clearCache: () => Promise.resolve(),
			openBundleSource: bundleSourceOf([["OFAC_SDN", "1"]]),
		});
		await expect(runtime.catalogLists()).rejects.toThrow(
			/requires a successful bootstrap/,
		);
	});
});

// --- defaultRuntimeDeps: the production seams over a scripted Worker -----------

/** Requests the scripted engine Worker received, by kind, in order. */
const scriptedRequests: string[] = [];

/** A scripted stand-in for the sync engine Worker (worker.ts): replies to
 * sync/readFile/clear like the real one over an empty-but-valid bundle, so the
 * default clearCache seam (spawn → sync → catalog → clear) runs end-to-end on
 * the main thread with no OPFS and no real module Worker. */
class ScriptedEngineWorker {
	#listener: ((event: MessageEvent<unknown>) => void) | undefined;

	public addEventListener(
		_type: "message",
		listener: (event: MessageEvent<unknown>) => void,
	): void {
		this.#listener = listener;
	}

	public postMessage(request: {
		kind: "sync" | "readFile" | "clear";
		id: number;
	}): void {
		scriptedRequests.push(request.kind);
		const respond = (data: unknown): void => {
			queueMicrotask(() => this.#listener?.({ data } as MessageEvent<unknown>));
		};
		if (request.kind === "sync") {
			respond({
				ok: true,
				id: request.id,
				kind: "sync",
				result: {
					version: "demo-1",
					manifestHash: "h".repeat(64),
					chunksFetched: 0,
					chunksReused: 0,
					bytesFetched: 0,
				},
			});
			return;
		}
		if (request.kind === "readFile") {
			respond({
				ok: true,
				id: request.id,
				kind: "readFile",
				bytes: new TextEncoder().encode(
					JSON.stringify({
						schemaVersion: 1,
						generatedAt: "2026-06-19T00:00:00Z",
						lists: [],
					}),
				),
			});
			return;
		}
		respond({ ok: true, id: request.id, kind: "clear" });
	}

	public terminate(): void {}
}

describe("defaultRuntimeDeps (production seams over a scripted Worker)", () => {
	it("clearCache drops the durable store through a spawned Worker client", async () => {
		scriptedRequests.length = 0;
		vi.stubGlobal("Worker", ScriptedEngineWorker);

		await defaultRuntimeDeps().clearCache();

		// The transient bundle source syncs, validates the catalog, then clears.
		expect(scriptedRequests).toEqual(["sync", "readFile", "clear"]);
	});

	it("makeEmbedder builds a Worker-backed embedder", () => {
		vi.stubGlobal("Worker", ScriptedEngineWorker);
		const embedder = defaultRuntimeDeps().makeEmbedder(() => {});
		expect(typeof embedder.embed).toBe("function");
	});
});
