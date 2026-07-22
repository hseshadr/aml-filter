// The browser runtime that turns the signed, verified watchlist bundle into a
// live, in-tab ScreeningEngine — the in-browser replacement for the FastAPI
// screen.
//
//   - the bundle source (bundleSource.ts) delta-syncs + verifies (fail-closed)
//     the signed, content-addressed bundle THROUGH A WORKER, materializes its
//     catalog + each enabled list's files out of the durable OPFS store, and
//     builds the cosine index + entity map. This is the ONLY catalog/list path:
//     dev, e2e, and prod all run the exact same signed-bundle delta-sync;
//   - the embedder Worker (embedderWorker.ts) owns transformers.js: the ~23 MB
//     all-MiniLM-L6-v2 weights download + ONNX inference for the QUERY only.
//
// bootstrap() drives both through real stages (downloading list… verifying…
// loading model…). Production model loading is intentionally indeterminate while
// transformers.js 4.2.0's progress callback duplicates the ONNX fetch. It is idempotent: the
// engine is built once and cached; later calls return the same instance.

import {
	type BundleSource,
	type BundleSourceDeps,
	openBundleSource,
} from "./bundleSource";
import {
	createEmbedder,
	type Embedder,
	type EmbedProgress,
	type OnEmbedProgress,
} from "./embedder";
import { createWorkerEmbedder, spawnEmbedderWorker } from "./embedderClient";
import {
	createMultiListScreeningEngine,
	createStreamingMultiListScreeningEngine,
	type ListThresholds,
	type MultiListScreeningEngine,
	type StreamingListSource,
} from "./multiEngine";
import { PRESETS } from "./scoring";
import type { OnSyncProgress, SyncProgress } from "./sync/types";
import { compositeVersion } from "./version";
import type {
	LoadedWatchlist,
	WatchlistCatalog,
	WatchlistCatalogEntry,
} from "./watchlist";
import { WatchlistFormatError } from "./watchlist";

/** Any non-empty string warms the ONNX session; content is discarded. */
const WARMUP_PROMPT = "warm up the model";

/**
 * Hard ceiling on the warmup embed — the ~23 MB model download + ONNX compile.
 * A stalled HF CDN would otherwise leave bootstrap pending forever (the boot
 * banner never resolves and never errors); this turns a stall into a reject so
 * the caller's `.catch` runs and the UI can offer a retry. This is the
 * PRODUCTION default; the cold-cache e2e overrides it via
 * `VITE_MODEL_LOAD_TIMEOUT_MS` (see {@link modelLoadTimeoutMs}) to fail fast.
 */
export const MODEL_LOAD_TIMEOUT_MS = 120_000;

/**
 * Hard ceiling on the WHOLE boot (download → verify → model load), a superset of
 * the model-load ceiling. Its job is the phase the model timeout doesn't cover:
 * a signed-bundle sync that stalls — many chunk fetches each under the per-fetch
 * ceiling but collectively hanging, or a wedged Worker — which would otherwise
 * leave the banner on "Downloading the signed sanctions list…" forever (the
 * exact iOS symptom). On expiry the boot rejects, the memo clears, and the UI's
 * error banner + Retry appears. Deliberately LONGER than
 * {@link MODEL_LOAD_TIMEOUT_MS} so the model-load timeout stays the tighter, more
 * specific bound; the cold-cache e2e overrides it via `VITE_BOOT_TIMEOUT_MS`.
 * Maps to the future canonical `bundle.timeout` error code.
 */
export const BOOT_TIMEOUT_MS = 180_000;

/** Parse a positive-millisecond override fail-closed: an absent, non-numeric,
 * non-finite, or non-positive value yields `fallback`, so a malformed env var can
 * never weaken a production ceiling to 0/NaN. */
function parsePositiveMs(raw: string | undefined, fallback: number): number {
	if (raw === undefined) {
		return fallback;
	}
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return parsed;
}

/**
 * Parse a model-load timeout override (ms) fail-closed: an absent, non-numeric,
 * non-finite, or non-positive value falls back to {@link MODEL_LOAD_TIMEOUT_MS},
 * so a malformed env var can never weaken the production ceiling to 0/NaN. Pure
 * over its input — the caller supplies the raw env string (or undefined).
 */
export function parseTimeoutMs(raw: string | undefined): number {
	return parsePositiveMs(raw, MODEL_LOAD_TIMEOUT_MS);
}

/**
 * The effective overall-boot timeout: the `VITE_BOOT_TIMEOUT_MS` override if
 * present and valid, otherwise {@link BOOT_TIMEOUT_MS}. The override exists only
 * so the cold-cache e2e can bound the "everything blocked" boot to seconds.
 */
export function bootTimeoutMs(
	env: Readonly<Record<string, string | undefined>>,
): number {
	return parsePositiveMs(env.VITE_BOOT_TIMEOUT_MS, BOOT_TIMEOUT_MS);
}

/**
 * The effective model-load timeout: the `VITE_MODEL_LOAD_TIMEOUT_MS` override if
 * present and valid, otherwise the production default. The override exists ONLY
 * so the cold-cache e2e can bound the "everything blocked" case to seconds; in a
 * normal build the env var is unset and the default stands.
 */
export function modelLoadTimeoutMs(
	env: Readonly<Record<string, string | undefined>>,
): number {
	return parseTimeoutMs(env.VITE_MODEL_LOAD_TIMEOUT_MS);
}

/**
 * Race a promise against a deadline. Resolves with the promise's value if it
 * settles first; otherwise rejects with `msg`. The timer is always cleared so a
 * resolved promise leaves no pending reject behind.
 */
export function withTimeout<T>(
	p: Promise<T>,
	ms: number,
	msg: string,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	const deadline = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => reject(new Error(msg)), ms);
	});
	return Promise.race([p, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Reject a lifecycle operation as soon as its owner is disposed. The wrapped
 * operation is intentionally left running: its own generation checks prevent
 * stale state publication, while the owner can synchronously terminate any
 * Worker it already created. This keeps navigation from waiting on a full boot
 * timeout merely to release a model/WASM heap.
 */
function withAbort<T>(
	p: Promise<T>,
	signal: AbortSignal,
	msg: string,
): Promise<T> {
	if (signal.aborted) {
		return Promise.reject(new Error(msg));
	}
	let onAbort: (() => void) | undefined;
	const aborted = new Promise<never>((_resolve, reject) => {
		onAbort = () => reject(new Error(msg));
		signal.addEventListener("abort", onAbort, { once: true });
	});
	return Promise.race([p, aborted]).finally(() => {
		if (onAbort !== undefined) {
			signal.removeEventListener("abort", onAbort);
		}
	});
}

/**
 * Wrap an {@link OnEmbedProgress} so it fires only when `Math.round(pct)`
 * changes. transformers.js streams many sub-percent download ticks; passing each
 * straight through would re-render the boot banner on every tick. The precise
 * `pct` is forwarded unchanged (the banner rounds for display); only the rounded
 * value gates the emit, so at most ~101 stage emissions occur over a full 0→100.
 */
export function throttleByRoundedPct(emit: OnEmbedProgress): OnEmbedProgress {
	let lastRounded: number | undefined;
	return (progress) => {
		const rounded = Math.round(progress.pct);
		if (rounded === lastRounded) {
			return;
		}
		lastRounded = rounded;
		emit(progress);
	};
}

/** A bootstrap stage surfaced to the UI. Production currently emits the plain
 * `loading-model` stage; injected embedders may still provide progress. */
export type BootStage =
	| { readonly kind: "downloading"; readonly progress?: SyncProgress }
	| { readonly kind: "verified"; readonly version: string }
	| { readonly kind: "loading-model"; readonly progress?: EmbedProgress }
	| { readonly kind: "ready" };

/** Progress sink; called as bootstrap advances through its stages. */
export type OnStage = (stage: BootStage) => void;

/** The pinned verify key the fail-closed watchlist load is keyed on. */
export interface RuntimeConfig {
	/** Same-origin URL of the pinned ed25519 public key. */
	readonly pubkeyUrl: string;
	/**
	 * The base URL of the signed, content-addressed bundle. Bootstrap delta-syncs
	 * + verifies it (fail-closed) THROUGH A WORKER and screens from the
	 * materialized lists — this is the ONLY catalog/list path, so it is always
	 * present (configFromEnv defaults it to `/bundle/origin`; the env var only
	 * OVERRIDES the default origin). The pinned pubkey is ALWAYS fetched
	 * same-origin from {@link pubkeyUrl}, never from this bundle origin.
	 */
	readonly bundleBaseUrl: string;
}

function sameRuntimeConfig(a: RuntimeConfig, b: RuntimeConfig): boolean {
	return a.pubkeyUrl === b.pubkeyUrl && a.bundleBaseUrl === b.bundleBaseUrl;
}

/**
 * Optional selection + scoring knobs for a bootstrap / re-bootstrap. `enabledLists`,
 * when present, restricts the load to catalog lists whose id is in the set (a stored
 * id absent from the catalog is silently skipped — the catalog is the source of truth
 * for existence; an empty set loads nothing and screens to no matches, which is valid).
 * When absent, EVERY catalog list loads (today's behavior). `thresholds`, when present,
 * feeds the per-list score floors into the engine; when absent the balanced default
 * applies to every list.
 */
export interface RuntimeSelection {
	readonly enabledLists?: ReadonlyArray<string>;
	readonly thresholds?: ListThresholds;
	/** Keep only one list's vector index resident while screening. */
	readonly residency?: "eager" | "streaming";
}

/** A selectable catalog list, surfaced to the settings UI for toggling. */
export interface CatalogListInfo {
	readonly id: string;
	readonly title: string;
}

/** The seams bootstrap depends on; defaulted to the real embedder Worker + the
 * signed-bundle source. `makeEmbedder` receives an optional progress sink for
 * injected implementations; the production worker currently stays indeterminate;
 * `openBundleSource` delta-syncs + verifies (fail-closed) the signed bundle (the
 * ONLY catalog/list path); `clearCache` drops the durable OPFS bundle store (the
 * "Clear cached lists" affordance). */
export interface RuntimeDeps {
	readonly makeEmbedder: (onProgress: OnEmbedProgress) => Embedder;
	readonly clearCache: () => Promise<void>;
	/** Open + delta-sync the signed bundle at `baseUrl`, verified fail-closed in the
	 * Worker against the pinned same-origin key at `pubkeyUrl` (the Worker fetches it
	 * — never the bundle origin). The ONLY catalog/list path. Injectable so unit
	 * tests drive the committed bundle over an in-memory store. */
	readonly openBundleSource: (
		baseUrl: string,
		pubkeyUrl: string,
		deps?: BundleSourceDeps,
		onProgress?: OnSyncProgress,
	) => Promise<BundleSource>;
}

const defaultDeps: RuntimeDeps = {
	makeEmbedder: (onProgress) =>
		createWorkerEmbedder(spawnEmbedderWorker(), onProgress),
	// "Clear cached lists": drop the durable OPFS bundle store (every chunk +
	// manifest + the active pointer) THROUGH THE WORKER (sync access handles are
	// Worker-only). A transient bundle source at the default origin owns the
	// Worker; the next load re-syncs from the now-empty store (re-fetches).
	clearCache: () =>
		openBundleSource(
			DEFAULT_BUNDLE_BASE_URL,
			new URL("public.key", document.baseURI).toString(),
		).then((source) => source.clear()),
	openBundleSource,
};

/**
 * Best-effort request that the browser keep the list cache + OPFS durable
 * (not evicted under storage pressure). Guarded: a browser without the
 * Storage API, or a denied request, is a no-op — durability is an
 * optimization, never a correctness requirement (every load re-verifies).
 */
async function requestPersistentStorage(): Promise<void> {
	try {
		await navigator.storage?.persist?.();
	} catch {
		// Persistence is best-effort; a failure must not abort bootstrap.
	}
}

/** Build the production runtime deps (signed-bundle source + embedder Worker). */
export function defaultRuntimeDeps(): RuntimeDeps {
	return defaultDeps;
}

/** The default per-list score floors: the balanced preset threshold for every
 * list. Settings-driven per-list overrides are the next wave; the mechanism
 * exists now (see {@link MultiListScreeningEngine}) but the default has none. */
const DEFAULT_THRESHOLDS: ListThresholds = {
	default: PRESETS.balanced.threshold,
};

// The composite version stamp now lives in ./version, so the score-receipt
// sealer inside MultiListScreeningEngine can stamp it without importing this
// module back (runtime -> multiEngine is already one-directional). Re-exported
// here so every existing `from "./runtime"` call site is unchanged.
export { compositeVersion };

/** The same-origin default bundle base URL: the signed bundle the SPA ships
 * under `public/bundle/origin/`. The signed-bundle delta-sync is the ONLY
 * catalog/list path, so this is always the base url unless overridden. */
const DEFAULT_BUNDLE_BASE_URL = "/bundle/origin";

/** Read Vite env into a RuntimeConfig; the pubkey is pinned same-origin. */
export function configFromEnv(
	env: Readonly<Record<string, string | undefined>>,
): RuntimeConfig {
	// The pinned key ships in the SPA build (public/public.key), served from the
	// app's OWN trusted origin. It is ALWAYS read same-origin — even on the bundle
	// path — never from the bundle origin: it is the trust anchor.
	const pubkeyUrl = new URL("public.key", document.baseURI).toString();
	// The signed-bundle delta-sync is the ONLY catalog/list path, so bundleBaseUrl
	// is ALWAYS a non-empty string: VITE_BUNDLE_BASE_URL only OVERRIDES the default
	// origin (e.g. the bundle e2e lane points it elsewhere). Empty/whitespace/unset
	// → the same-origin default `/bundle/origin`.
	const rawBundle = env.VITE_BUNDLE_BASE_URL?.trim();
	const bundleBaseUrl =
		rawBundle !== undefined && rawBundle.length > 0
			? rawBundle
			: DEFAULT_BUNDLE_BASE_URL;
	return { pubkeyUrl, bundleBaseUrl };
}

/** Re-exported so call sites that only need the pure embedder can build one. */
export { createEmbedder };

/**
 * Load + verify the signed watchlist, warm the embedder, and build the in-tab
 * ScreeningEngine. Idempotent — the first call wins and its result is cached.
 */
export class EngineRuntime {
	readonly #deps: RuntimeDeps;
	#enginePromise: Promise<MultiListScreeningEngine> | null = null;
	#reloadPromise: Promise<MultiListScreeningEngine> | null = null;
	#ready: MultiListScreeningEngine | null = null;
	#version: string | null = null;
	// Captured on the first successful bootstrap so reload() can re-fetch the
	// watchlist with the same pinned key and reuse the already-warm embedder
	// (no second ~23 MB model download).
	#embedder: Embedder | null = null;
	#config: RuntimeConfig | null = null;
	// The synced bundle (bundle path only): memoized so the catalog + every list +
	// the version poll all read from ONE delta-sync (one signed `/latest` fetch,
	// one verified promote), not N. Keyed implicitly by `#config.bundleBaseUrl`.
	#bundleSource: Promise<BundleSource> | null = null;
	// The active selection + thresholds, carried across reload so a re-bootstrap
	// with no override reuses the last enabled set / score floors.
	#selection: RuntimeSelection = {};
	// Serialize the complete lifecycle boundary. A cache clear must not race a
	// reload/bootstrap and leave an engine pointing at a half-cleared bundle.
	#lifecycleTail: Promise<void> = Promise.resolve();
	// Incremented whenever a boot is superseded by failure, disposal, or cache
	// reset. A timed-out Promise.race cannot cancel its inner build, so the build
	// carries this epoch and refuses to publish stale state when it eventually
	// resumes.
	#generation = 0;
	// Abort signal for the current boot. Disposal aborts this boundary
	// synchronously; the queued cleanup still owns final state reset.
	#bootAbort: AbortController | null = null;
	// The cold-sync download progress sink for the CURRENT boot only. Set for the
	// duration of #build so the (memoized, once-called) openBundleSource threads
	// per-chunk ticks to onStage; undefined on reload/poll opens (no banner).
	#onSyncProgress: OnSyncProgress | undefined = undefined;

	public constructor(deps: RuntimeDeps = defaultDeps) {
		this.#deps = deps;
	}

	/** The ready engine, or null before the first successful bootstrap. */
	public engine(): MultiListScreeningEngine | null {
		return this.#ready;
	}

	/** The composite version stamp (sorted `id@version` join), or null before
	 * bootstrap — for the rescan path to compare against a cheap manifest poll. */
	public version(): string | null {
		return this.#version;
	}

	/**
	 * Drop the durable OPFS bundle store (every chunk + manifest + the active
	 * pointer) — the "Clear cached lists" affordance. The clear runs THROUGH THE
	 * WORKER (sync access handles are Worker-only) via {@link RuntimeDeps.clearCache}
	 * (whose default opens a bundle source at the same-origin default origin and
	 * calls `.clear()`). The memoized bundle source is then dropped so the next
	 * load re-syncs from the now-empty store (re-fetches + re-verifies). The
	 * An in-flight boot is invalidated before the queue runs; the queue then
	 * disposes any running engine and model worker so the next load starts cleanly.
	 */
	public async clearListCache(): Promise<void> {
		this.#abortBootIfActive();
		return this.#enqueue(async () => {
			this.#generation += 1;
			const source = this.#bundleSource;
			this.#bundleSource = null;
			// Evict the active sync Worker before clearCache opens its temporary
			// worker, keeping the peak worker/WASM footprint bounded on mobile.
			await this.#disposeBundleSource(source);
			// Release vectors and metadata before clearCache opens its temporary sync
			// Worker. The optional embedder disposer terminates the model/WASM worker
			// before that second allocation can start.
			await this.#ready?.disposeWhenIdle();
			this.#ready = null;
			this.#version = null;
			this.#disposeEmbedder();
			this.#embedder = null;
			try {
				await this.#deps.clearCache();
			} finally {
				this.#config = null;
				this.#enginePromise = null;
			}
		});
	}

	/**
	 * Release the running engine (resident vectors + metadata) and the model
	 * worker WITHOUT touching the durable OPFS bundle store — the page-unmount
	 * counterpart to {@link clearListCache}. A page that owns its runtime calls
	 * this when it leaves the DOM so its embedder Worker + ONNX WASM heap don't
	 * outlive it; the untouched store keeps the next visit a warm re-sync, not a
	 * full re-download. A dispose invalidates an in-flight boot immediately, then
	 * the lifecycle queue tears down any replacement safely; the instance stays
	 * usable (a later bootstrap re-boots from scratch). Idempotent.
	 */
	public async dispose(): Promise<void> {
		this.#abortBootIfActive();
		return this.#enqueue(async () => {
			this.#generation += 1;
			const source = this.#bundleSource;
			this.#bundleSource = null;
			await this.#disposeBundleSource(source);
			await this.#ready?.disposeWhenIdle();
			this.#ready = null;
			this.#version = null;
			this.#disposeEmbedder();
			this.#embedder = null;
			this.#config = null;
			this.#enginePromise = null;
		});
	}

	/**
	 * Build (or reuse) the engine over the synced bundle, reporting progress. An
	 * optional {@link RuntimeSelection} restricts the loaded lists (`enabledLists`)
	 * and sets the per-list score floors (`thresholds`); both default to "all lists,
	 * balanced floor". Idempotent — the first call wins and its result is cached; a
	 * later enabled-set/threshold change goes through {@link reload}.
	 */
	public bootstrap(
		config: RuntimeConfig,
		onStage: OnStage = () => {},
		selection: RuntimeSelection = {},
	): Promise<MultiListScreeningEngine> {
		if (this.#reloadPromise !== null) {
			return this.#reloadPromise;
		}
		if (this.#enginePromise === null) {
			this.#selection = selection;
			const generation = this.#generation;
			const abort = new AbortController();
			this.#bootAbort = abort;
			// Bound the WHOLE boot, not just the model load: a stalled bundle sync
			// (or a wedged Worker) would otherwise hang the banner on "Downloading…"
			// forever. On expiry the boot rejects → the memo clears → the UI shows
			// its error banner + Retry (maps to future bundle.timeout).
			const deadlineMs = bootTimeoutMs(import.meta.env);
			const build = this.#enqueue(() =>
				withTimeout(
					withAbort(
						this.#build(config, onStage, generation),
						abort.signal,
						"screening engine boot superseded",
					),
					deadlineMs,
					`loading the screening engine timed out after ${deadlineMs}ms`,
				),
			);
			this.#enginePromise = build.then(
				(result) => {
					if (this.#bootAbort === abort) {
						this.#bootAbort = null;
					}
					return result;
				},
				(error: unknown) => {
					// Let a failed (or timed-out) bootstrap be retried by clearing the memo.
					if (this.#bootAbort === abort) {
						this.#bootAbort = null;
						this.#generation += 1;
						this.#disposeEmbedder();
						this.#embedder = null;
						this.#config = null;
						this.#enginePromise = null;
						const source = this.#bundleSource;
						this.#bundleSource = null;
						void this.#disposeBundleSource(source);
					}
					throw error;
				},
			);
		}
		return this.#enginePromise;
	}

	/** EVERY list in the signed catalog as `{id, title}` — the real selectable set
	 * the UI offers (the catalog is the source of truth for which lists exist).
	 * A config allows settings to read signed metadata before loading the model. */
	public catalogLists(
		config?: RuntimeConfig,
	): Promise<ReadonlyArray<CatalogListInfo>> {
		return this.#enqueue(async () => {
			let replaced: Promise<BundleSource> | null = null;
			if (
				config !== undefined &&
				this.#config !== null &&
				!sameRuntimeConfig(this.#config, config)
			) {
				if (this.#enginePromise !== null) {
					throw new Error("runtime config cannot change after bootstrap");
				}
				// A catalog-only settings read may have memoized a source for a prior
				// origin; drop it before accepting the new trust/config boundary.
				replaced = this.#bundleSource;
				this.#bundleSource = null;
				this.#config = config;
			}
			if (this.#config === null) {
				if (config === undefined) {
					throw new Error(
						"catalogLists() requires a runtime config before bootstrap",
					);
				}
				this.#config = config;
			}
			try {
				return await this.#catalogLists();
			} finally {
				await this.#disposeBundleSource(replaced);
			}
		});
	}

	async #catalogLists(): Promise<ReadonlyArray<CatalogListInfo>> {
		if (this.#config === null) {
			throw new Error("catalogLists() requires a successful bootstrap first");
		}
		const catalog = await this.#loadCatalog(this.#config);
		return catalog.lists.map((entry) => ({ id: entry.id, title: entry.title }));
	}

	/** Just the ids of every catalog list (the selectable set, sans titles). */
	public async catalogListIds(
		config?: RuntimeConfig,
	): Promise<ReadonlyArray<string>> {
		return (await this.catalogLists(config)).map((list) => list.id);
	}

	/**
	 * Re-fetch + re-verify (fail-closed) the catalog and EVERY list, rebuilding the
	 * MultiListScreeningEngine over the SAME already-warm embedder (no second model
	 * download). The old engine and bundle source are released before replacement
	 * loading so mobile refreshes stay single-engine and bounded. A verify failure
	 * rejects and leaves no ready engine; the warm embedder remains available for a
	 * retry. Used by the app's "Check for updates" path once a poll detects a new
	 * publish. Requires a prior successful bootstrap (the embedder + pinned-key
	 * config are captured then); calling reload before that throws.
	 */
	public reload(
		selection?: RuntimeSelection,
	): Promise<MultiListScreeningEngine> {
		if (this.#reloadPromise !== null) {
			return this.#reloadPromise;
		}
		const run = this.#enqueue(() => this.#reload(selection));
		this.#reloadPromise = run;
		void run.then(
			() => {
				if (this.#reloadPromise === run) this.#reloadPromise = null;
			},
			() => {
				if (this.#reloadPromise === run) this.#reloadPromise = null;
			},
		);
		return run;
	}

	async #reload(
		selection?: RuntimeSelection,
	): Promise<MultiListScreeningEngine> {
		if (this.#embedder === null || this.#config === null) {
			throw new Error("reload() requires a successful bootstrap first");
		}
		// A new selection replaces the active one; omitting it reuses the last
		// enabled set + thresholds (a plain "new publish" reload).
		if (selection !== undefined) {
			this.#selection = selection;
		}
		// Drop the old engine BEFORE loading the replacement. Keeping both eager
		// vector matrices resident during a refresh is the mobile OOM failure mode;
		// a refresh is intentionally single-engine and fail-closed (a failed refresh
		// leaves no ready engine, so the caller can retry from a bounded baseline).
		const previous = this.#ready;
		this.#ready = null;
		this.#version = null;
		this.#enginePromise = null;
		await previous?.disposeWhenIdle();
		// Drop the memoized bundle sync so a reload re-runs the signed delta-sync
		// (picking up a republished `/latest`) after the previous source is released.
		const previousSource = this.#bundleSource;
		this.#bundleSource = null;
		await this.#disposeBundleSource(previousSource);
		try {
			const engine =
				this.#selection.residency === "streaming"
					? createStreamingMultiListScreeningEngine(
							await this.#loadStreamingSources(this.#config),
							this.#embedder,
							this.#thresholds(),
						)
					: createMultiListScreeningEngine(
							await this.#loadEnabledLists(this.#config),
							this.#embedder,
							this.#thresholds(),
						);
			this.#ready = engine;
			this.#version = compositeVersion(engine.listVersions());
			this.#enginePromise = Promise.resolve(engine);
			return engine;
		} catch (error) {
			// The old engine/source were intentionally evicted before replacement load,
			// so only dispose a partially-built replacement. The warm embedder remains
			// reusable for a bounded retry; no second model worker is allocated.
			const failedSource = this.#bundleSource;
			this.#bundleSource = null;
			this.#enginePromise = null;
			await this.#disposeBundleSource(failedSource);
			throw error;
		}
	}

	/** Queue an operation after the current bootstrap/reload/clear boundary. */
	#enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const run = this.#lifecycleTail.then(operation);
		this.#lifecycleTail = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	/** Release an optional model/WASM worker without making disposal mandatory. */
	#disposeEmbedder(): void {
		this.#embedder?.dispose?.();
	}

	/** Invalidate a boot before queueing its eventual lifecycle cleanup. */
	#abortBootIfActive(): void {
		const abort = this.#bootAbort;
		if (abort === null) {
			return;
		}
		this.#bootAbort = null;
		this.#generation += 1;
		abort.abort();
		this.#disposeEmbedder();
		this.#embedder = null;
		const source = this.#bundleSource;
		this.#bundleSource = null;
		void this.#disposeBundleSource(source);
	}

	/** Evict a memoized source without letting cleanup errors mask the operation. */
	async #disposeBundleSource(
		source: Promise<BundleSource> | null,
	): Promise<void> {
		if (source === null) {
			return;
		}
		try {
			(await source).dispose?.();
		} catch {
			// Source load failures are already surfaced by the owning operation.
		}
	}

	/**
	 * Cheap new-publish poll: fetch + verify (fail-closed) the catalog + EACH
	 * list's tiny manifest (no vectors, no model) and return the SAME composite
	 * stamp shape as {@link version}. The "Check for updates" path compares the
	 * two; a bumped per-list version OR a list add/remove changes the stamp.
	 * Requires a prior bootstrap (the pinned-key config is captured then).
	 */
	public fetchPublishedVersion(): Promise<string> {
		return this.#enqueue(() => this.#fetchPublishedVersion());
	}

	async #fetchPublishedVersion(): Promise<string> {
		if (this.#config === null) {
			throw new Error(
				"fetchPublishedVersion() requires a successful bootstrap first",
			);
		}
		// A FRESH delta-sync (no-store `/latest`) is the version signal — its signed
		// pointer version is the authoritative published stamp, and the catalog's
		// per-entry versions detect a bumped list or an add/remove. Keep the active
		// memoized source alive: streamed engines retain loaders that close over it.
		// Open a short-lived poll source instead, then terminate only that source.
		const pollSource = await this.#deps.openBundleSource(
			this.#config.bundleBaseUrl,
			this.#config.pubkeyUrl,
		);
		try {
			const catalog = pollSource.loadCatalog();
			const versions: Record<string, string> = {};
			for (const entry of catalog.lists) {
				versions[entry.id] = entry.version;
			}
			return compositeVersion(versions);
		} finally {
			pollSource.dispose?.();
		}
	}

	/** The active per-list score floors: the configured thresholds, or the
	 * balanced default for every list when no selection thresholds were given. */
	#thresholds(): ListThresholds {
		return this.#selection.thresholds ?? DEFAULT_THRESHOLDS;
	}

	/** The synced bundle for the active config, delta-synced once + memoized. The
	 * pinned pubkey is fetched SAME-ORIGIN (the trust anchor), never the bundle
	 * origin. A failed sync clears the memo so a later call retries. */
	#bundleSourceFor(
		config: RuntimeConfig,
		baseUrl: string,
	): Promise<BundleSource> {
		if (this.#bundleSource === null) {
			// The Worker fetches + verifies the pinned same-origin pubkey itself; the
			// main thread never touches OPFS (sync access handles are Worker-only).
			this.#bundleSource = this.#deps
				.openBundleSource(
					baseUrl,
					config.pubkeyUrl,
					undefined,
					this.#onSyncProgress,
				)
				.catch((error: unknown) => {
					this.#bundleSource = null;
					throw error;
				});
		}
		return this.#bundleSource;
	}

	/** Fetch + verify the catalog for the active config: the signed BUNDLE catalog
	 * (delta-synced), the ONLY catalog path. */
	async #loadCatalog(config: RuntimeConfig): Promise<WatchlistCatalog> {
		return (
			await this.#bundleSourceFor(config, config.bundleBaseUrl)
		).loadCatalog();
	}

	/** Load + verify + build ONE list for the active config: from the materialized
	 * BUNDLE files (delta-synced), the ONLY list path. */
	async #loadList(
		config: RuntimeConfig,
		entry: WatchlistCatalogEntry,
	): Promise<LoadedWatchlist> {
		return (await this.#bundleSourceFor(config, config.bundleBaseUrl)).loadList(
			entry,
		);
	}

	/**
	 * Load + verify the ENABLED catalog lists, fail-closed: a verify/load failure
	 * on any single enabled list rejects the whole load (a verify failure is a
	 * security event, not degraded mode — no catch-and-skip). When the active
	 * selection has no `enabledLists`, every catalog list loads (today's behavior);
	 * an id in `enabledLists` that is absent from the catalog is silently skipped
	 * (the catalog is the source of truth for existence); an empty enabled set
	 * loads nothing.
	 */
	async #loadEnabledLists(config: RuntimeConfig): Promise<LoadedWatchlist[]> {
		const catalog = await this.#loadCatalog(config);
		const enabled = this.#selection.enabledLists;
		const entries =
			enabled === undefined
				? catalog.lists
				: catalog.lists.filter((entry) => enabled.includes(entry.id));
		const loaded: LoadedWatchlist[] = [];
		for (const entry of entries) {
			loaded.push(await this.#loadList(config, entry));
		}
		return loaded;
	}

	/** Load entity metadata only; vector files are fetched on each screen call. */
	async #loadStreamingSources(
		config: RuntimeConfig,
	): Promise<ReadonlyArray<StreamingListSource>> {
		const source = await this.#bundleSourceFor(config, config.bundleBaseUrl);
		if (source.loadListMetadata === undefined) {
			throw new Error(
				"streaming residency is unavailable for this bundle source",
			);
		}
		const catalog = source.loadCatalog();
		const enabled = this.#selection.enabledLists;
		const entries =
			enabled === undefined
				? catalog.lists
				: catalog.lists.filter((entry) => enabled.includes(entry.id));
		const sources: StreamingListSource[] = [];
		for (const entry of entries) {
			const metadata = await source.loadListMetadata(entry);
			if (metadata.listId !== entry.id || metadata.version !== entry.version) {
				throw new WatchlistFormatError(
					`bundle list ${entry.id} metadata skew: catalog ${entry.version}, metadata ${metadata.listId}@${metadata.version}`,
				);
			}
			sources.push({
				listId: metadata.listId,
				version: metadata.version,
				entities: metadata.entities,
				load: () => source.loadList(entry),
			});
		}
		return sources;
	}

	async #build(
		config: RuntimeConfig,
		onStage: OnStage,
		generation: number,
	): Promise<MultiListScreeningEngine> {
		const assertCurrent = (): void => {
			if (this.#generation !== generation) {
				throw new Error("screening engine boot superseded");
			}
		};
		onStage({ kind: "downloading" });
		// Capture the config up front so the catalog/list loaders (JSON or bundle)
		// and the post-bootstrap methods (catalogLists/fetchPublishedVersion/reload)
		// see it. A failed build clears the bootstrap memo, so a retry re-runs this.
		if (this.#config !== null && !sameRuntimeConfig(this.#config, config)) {
			const previousSource = this.#bundleSource;
			this.#bundleSource = null;
			await this.#disposeBundleSource(previousSource);
		}
		this.#config = config;
		// Ask the browser to keep the model cache + OPFS durable ONCE up front
		// (best-effort, guarded — a no-op where unsupported). Model weights use
		// CacheStorage; signed bundle bytes use the Worker-owned OPFS store.
		await requestPersistentStorage();
		assertCurrent();
		// Feed cold-sync per-chunk progress to the downloading banner for THIS boot
		// only. The bundle open is memoized + called once (in #loadEnabledLists →
		// #bundleSourceFor), so this sink is live exactly across that sync; cleared
		// after so reload/poll opens carry no banner sink.
		this.#onSyncProgress = (progress) =>
			onStage({ kind: "downloading", progress });
		let loaded: LoadedWatchlist[] | undefined;
		let streamingSources: ReadonlyArray<StreamingListSource> | undefined;
		try {
			if (this.#selection.residency === "streaming") {
				streamingSources = await this.#loadStreamingSources(config);
			} else {
				loaded = await this.#loadEnabledLists(config);
			}
		} finally {
			this.#onSyncProgress = undefined;
		}
		assertCurrent();
		const versions: Record<string, string> = {};
		for (const l of loaded ?? streamingSources ?? []) {
			versions[l.listId] = l.version;
		}
		this.#version = compositeVersion(versions);
		onStage({ kind: "verified", version: this.#version });

		onStage({ kind: "loading-model" });
		// Re-fire the stage with each download tick so the banner shows a percent,
		// but throttled to a CHANGED rounded percent. transformers.js fires many
		// ticks for the ~23 MB download; without this every tick would re-render
		// the banner. Deduping on Math.round(pct) caps emissions at ~100. The
		// precise pct is preserved on the stage; only the rounded value gates the
		// emit, matching the banner's own Math.round(pct) render.
		const onModelProgress = throttleByRoundedPct((progress) =>
			onStage({ kind: "loading-model", progress }),
		);
		const embedder = this.#embedder ?? this.#deps.makeEmbedder(onModelProgress);
		this.#embedder = embedder;
		// Force the ~23 MB model download/compile now so "loading-model" reflects
		// real work and the first user query is fast. Bounded: a stalled CDN must
		// reject (bootstrap clears its memo + the UI errors) rather than hang. The
		// ceiling is the production default unless the cold-cache e2e overrode it
		// via VITE_MODEL_LOAD_TIMEOUT_MS, so that test can fail fast and loud.
		const timeoutMs = modelLoadTimeoutMs(import.meta.env);
		await withTimeout(
			embedder.embed(WARMUP_PROMPT),
			timeoutMs,
			`loading the name-matching model timed out after ${timeoutMs}ms`,
		);
		assertCurrent();

		const engine =
			streamingSources !== undefined
				? createStreamingMultiListScreeningEngine(
						streamingSources,
						embedder,
						this.#thresholds(),
					)
				: createMultiListScreeningEngine(
						loaded ?? [],
						embedder,
						this.#thresholds(),
					);
		this.#ready = engine;
		onStage({ kind: "ready" });
		return engine;
	}
}
