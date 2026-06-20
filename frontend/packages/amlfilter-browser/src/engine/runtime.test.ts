import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Embedder, EmbedProgress } from "./embedder";
import {
	type BootStage,
	compositeVersion,
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
	// The runtime fetches the pinned pubkey same-origin before loading the
	// watchlist; stub fetch so that read succeeds with deterministic bytes.
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
			loadCatalog: () => Promise.resolve(catalogOf([["OFAC_SDN", "test"]])),
			loadList: () => Promise.resolve(fakeLoaded()),
			makeEmbedder: () => embedder,
			clearCache: () => Promise.resolve(),
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

	/** Deps whose loadList returns a `<listId>:E@<version>` loaded watchlist per
	 * catalog entry, with the catalog drawn from a queue (boot then reload). */
	function depsForCatalogs(catalogs: ReadonlyArray<WatchlistCatalog>): {
		deps: RuntimeDeps;
		makeEmbedder: ReturnType<typeof vi.fn>;
	} {
		let calls = 0;
		const makeEmbedder = vi.fn(() => instantEmbedder());
		const deps: RuntimeDeps = {
			loadCatalog: () => {
				const c = catalogs[Math.min(calls, catalogs.length - 1)];
				calls += 1;
				return Promise.resolve(c as WatchlistCatalog);
			},
			loadList: (_pubkey, entry) =>
				Promise.resolve(loadedAt(entry.version, `${entry.id}:E`, entry.id)),
			makeEmbedder,
			clearCache: () => Promise.resolve(),
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
		const runtime = new EngineRuntime({
			loadCatalog: () =>
				Promise.resolve(
					catalogOf([
						["EU_CONSOLIDATED", "demo-1"],
						["OFAC_SDN", "demo-1"],
					]),
				),
			loadList: (_pubkey, entry) =>
				entry.id === "OFAC_SDN"
					? Promise.reject(new Error("signature verification failed"))
					: Promise.resolve(loadedAt(entry.version, `${entry.id}:E`)),
			makeEmbedder,
			clearCache: () => Promise.resolve(),
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
		const { deps } = depsForCatalogs([catalogOf([["OFAC_SDN", "demo-1"]])]);
		// After bootstrap, the catalog poll reports a bumped list version.
		const polled = catalogOf([["OFAC_SDN", "demo-2"]]);
		const runtime = new EngineRuntime({
			...deps,
			loadCatalog: vi
				.fn<RuntimeDeps["loadCatalog"]>()
				.mockResolvedValueOnce(catalogOf([["OFAC_SDN", "demo-1"]]))
				.mockResolvedValue(polled),
		});
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

	/** Deps over a static multi-list catalog; loadList tracks which ids loaded. */
	function depsFor(catalog: WatchlistCatalog): {
		deps: RuntimeDeps;
		loadedIds: string[];
		makeEmbedder: ReturnType<typeof vi.fn>;
	} {
		const loadedIds: string[] = [];
		const makeEmbedder = vi.fn(() => instantEmbedder());
		const deps: RuntimeDeps = {
			loadCatalog: () => Promise.resolve(catalog),
			loadList: (_pubkey, entry) => {
				loadedIds.push(entry.id);
				return Promise.resolve(
					loadedAt(entry.version, `${entry.id}:E`, entry.id),
				);
			},
			makeEmbedder,
			clearCache: () => Promise.resolve(),
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
			loadCatalog: () => Promise.resolve(catalogOf([["OFAC_SDN", "test"]])),
			loadList: () => Promise.resolve(fakeLoaded()),
			makeEmbedder: () => neverEmbedder(),
			clearCache: () => Promise.resolve(),
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

	it("threads an embedder progress event into a loading-model stage", async () => {
		// The embedder factory receives an onProgress sink; this fake fires one
		// progress event during warmup, which the runtime must surface as a
		// loading-model BootStage carrying that progress.
		const deps: RuntimeDeps = {
			loadCatalog: () => Promise.resolve(catalogOf([["OFAC_SDN", "test"]])),
			loadList: () => Promise.resolve(fakeLoaded()),
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
			loadCatalog: () => Promise.resolve(catalogOf([["OFAC_SDN", "v"]])),
			loadList: () => Promise.resolve(fakeLoaded()),
			makeEmbedder: () => instantEmbedder(),
			clearCache,
		});
		await runtime.clearListCache();
		expect(clearCache).toHaveBeenCalledTimes(1);
	});

	it("defaultRuntimeDeps exposes a clearCache seam (cache-aware by default)", () => {
		expect(typeof defaultRuntimeDeps().clearCache).toBe("function");
	});
});
