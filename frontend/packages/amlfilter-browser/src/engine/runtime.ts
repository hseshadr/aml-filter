// The browser runtime that turns the signed, verified OFAC watchlist into a
// live, in-tab ScreeningEngine — the in-browser replacement for the FastAPI
// screen.
//
//   - the watchlist loader (watchlist.ts) fetches ONE signed JSON watchlist
//     (+ manifest) same-origin, verifies its detached ed25519 signature
//     FAIL-CLOSED against the pinned key, decodes the precomputed vectors, and
//     builds the cosine index + entity map;
//   - the embedder Worker (embedderWorker.ts) owns transformers.js: the ~23 MB
//     all-MiniLM-L6-v2 weights download + ONNX inference for the QUERY only.
//
// bootstrap() drives both with a progress callback so the UI can show real
// stages (downloading list… verifying… loading model…). It is idempotent: the
// engine is built once and cached; later calls return the same instance.

import {
	createEmbedder,
	type Embedder,
	type EmbedProgress,
	type OnEmbedProgress,
} from "./embedder";
import { createWorkerEmbedder, spawnEmbedderWorker } from "./embedderClient";
import {
	createMultiListScreeningEngine,
	type ListThresholds,
	type MultiListScreeningEngine,
} from "./multiEngine";
import { PRESETS } from "./scoring";
import {
	fetchVerifiedCatalog,
	type LoadedWatchlist,
	loadList,
	type WatchlistCatalog,
	type WatchlistCatalogEntry,
} from "./watchlist";

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
 * Parse a model-load timeout override (ms) fail-closed: an absent, non-numeric,
 * non-finite, or non-positive value falls back to {@link MODEL_LOAD_TIMEOUT_MS},
 * so a malformed env var can never weaken the production ceiling to 0/NaN. Pure
 * over its input — the caller supplies the raw env string (or undefined).
 */
export function parseTimeoutMs(raw: string | undefined): number {
	if (raw === undefined) {
		return MODEL_LOAD_TIMEOUT_MS;
	}
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return MODEL_LOAD_TIMEOUT_MS;
	}
	return parsed;
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

/** A bootstrap stage, surfaced to the UI for a real progress story. The
 * `loading-model` stage may fire with no progress yet (the plain banner) and
 * then re-fire carrying download progress as the ~23 MB model streams in. */
export type BootStage =
	| { readonly kind: "downloading" }
	| { readonly kind: "verified"; readonly version: string }
	| { readonly kind: "loading-model"; readonly progress?: EmbedProgress }
	| { readonly kind: "ready" };

/** Progress sink; called as bootstrap advances through its stages. */
export type OnStage = (stage: BootStage) => void;

/** The pinned verify key the fail-closed watchlist load is keyed on. */
export interface RuntimeConfig {
	/** Same-origin URL of the pinned ed25519 public key. */
	readonly pubkeyUrl: string;
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
}

/** A selectable catalog list, surfaced to the settings UI for toggling. */
export interface CatalogListInfo {
	readonly id: string;
	readonly title: string;
}

/** Fetch + verify the signed catalog (the manifest of every published list). */
export type LoadCatalog = (pubkey: Uint8Array) => Promise<WatchlistCatalog>;

/** Fetch + verify + decode + build ONE per-list watchlist under its catalog entry. */
export type LoadList = (
	pubkey: Uint8Array,
	entry: WatchlistCatalogEntry,
) => Promise<LoadedWatchlist>;

/** The seams bootstrap depends on; defaulted to the real loaders + embedder Worker.
 * `makeEmbedder` receives an `onProgress` sink the runtime wires to the boot
 * banner so model-download progress reaches the UI. */
export interface RuntimeDeps {
	readonly loadCatalog: LoadCatalog;
	readonly loadList: LoadList;
	readonly makeEmbedder: (onProgress: OnEmbedProgress) => Embedder;
}

const defaultDeps: RuntimeDeps = {
	loadCatalog: fetchVerifiedCatalog,
	loadList,
	makeEmbedder: (onProgress) =>
		createWorkerEmbedder(spawnEmbedderWorker(), onProgress),
};

/** Build the production runtime deps (real catalog + list loaders + embedder Worker). */
export function defaultRuntimeDeps(): RuntimeDeps {
	return defaultDeps;
}

/** The default per-list score floors: the balanced preset threshold for every
 * list. Settings-driven per-list overrides are the next wave; the mechanism
 * exists now (see {@link MultiListScreeningEngine}) but the default has none. */
const DEFAULT_THRESHOLDS: ListThresholds = {
	default: PRESETS.balanced.threshold,
};

/**
 * The composite version stamp: each list's `id@version`, sorted by id and
 * joined with `|`. Derived from the per-list LOADED versions (not the catalog's
 * generatedAt) so a no-op republish that only bumps generatedAt does NOT churn
 * the stamp; a bumped per-list version or a list add/remove DOES. Pure +
 * exported so the app can compare fetchPublishedVersion() against version().
 */
export function compositeVersion(
	versions: Readonly<Record<string, string>>,
): string {
	return Object.keys(versions)
		.sort()
		.map((id) => `${id}@${versions[id]}`)
		.join("|");
}

/** Fetch the pinned ed25519 public key same-origin (no-store), as raw bytes. */
async function fetchPubkey(pubkeyUrl: string): Promise<Uint8Array> {
	const response = await fetch(pubkeyUrl, { cache: "no-store" });
	if (!response.ok) {
		throw new Error(`fetch public key failed: HTTP ${response.status}`);
	}
	return new Uint8Array(await response.arrayBuffer());
}

/** Read Vite env into a RuntimeConfig; the pubkey is pinned same-origin. */
export function configFromEnv(
	_env: Readonly<Record<string, string>>,
): RuntimeConfig {
	// The pinned key ships in the SPA build (public/public.key), served from the
	// app's OWN trusted origin — the same origin the static watchlist is served
	// from. The watchlist is no longer fetched from a separate bundle origin.
	const pubkeyUrl = new URL("public.key", document.baseURI).toString();
	return { pubkeyUrl };
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
	#ready: MultiListScreeningEngine | null = null;
	#version: string | null = null;
	// Captured on the first successful bootstrap so reload() can re-fetch the
	// watchlist with the same pinned key and reuse the already-warm embedder
	// (no second ~23 MB model download).
	#embedder: Embedder | null = null;
	#config: RuntimeConfig | null = null;
	// The active selection + thresholds, carried across reload so a re-bootstrap
	// with no override reuses the last enabled set / score floors.
	#selection: RuntimeSelection = {};

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
		if (this.#enginePromise === null) {
			this.#selection = selection;
			this.#enginePromise = this.#build(config, onStage).catch((error) => {
				// Let a failed bootstrap be retried by clearing the memo.
				this.#enginePromise = null;
				throw error;
			});
		}
		return this.#enginePromise;
	}

	/** EVERY list in the signed catalog as `{id, title}` — the real selectable set
	 * the UI offers (the catalog is the source of truth for which lists exist).
	 * Requires a prior successful bootstrap (the pinned-key config is captured then). */
	public async catalogLists(): Promise<ReadonlyArray<CatalogListInfo>> {
		if (this.#config === null) {
			throw new Error("catalogLists() requires a successful bootstrap first");
		}
		const pubkey = await fetchPubkey(this.#config.pubkeyUrl);
		const catalog = await this.#deps.loadCatalog(pubkey);
		return catalog.lists.map((entry) => ({ id: entry.id, title: entry.title }));
	}

	/** Just the ids of every catalog list (the selectable set, sans titles). */
	public async catalogListIds(): Promise<ReadonlyArray<string>> {
		return (await this.catalogLists()).map((list) => list.id);
	}

	/**
	 * Re-fetch + re-verify (fail-closed) the catalog and EVERY list, rebuild the
	 * MultiListScreeningEngine over the SAME already-warm embedder (no second
	 * model download), and swap the ready engine + composite version. A verify
	 * failure on the catalog OR any list rejects — no partial swap. Used by the
	 * app's "Check for updates" path once a poll detects a new publish. Requires a
	 * prior successful bootstrap (the embedder + pinned-key config are captured
	 * then); calling reload before that throws.
	 */
	public async reload(
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
		const pubkey = await fetchPubkey(this.#config.pubkeyUrl);
		const loaded = await this.#loadEnabledLists(pubkey);
		const engine = createMultiListScreeningEngine(
			loaded,
			this.#embedder,
			this.#thresholds(),
		);
		this.#ready = engine;
		this.#version = compositeVersion(engine.listVersions());
		this.#enginePromise = Promise.resolve(engine);
		return engine;
	}

	/**
	 * Cheap new-publish poll: fetch + verify (fail-closed) the catalog + EACH
	 * list's tiny manifest (no vectors, no model) and return the SAME composite
	 * stamp shape as {@link version}. The "Check for updates" path compares the
	 * two; a bumped per-list version OR a list add/remove changes the stamp.
	 * Requires a prior bootstrap (the pinned-key config is captured then).
	 */
	public async fetchPublishedVersion(): Promise<string> {
		if (this.#config === null) {
			throw new Error(
				"fetchPublishedVersion() requires a successful bootstrap first",
			);
		}
		const pubkey = await fetchPubkey(this.#config.pubkeyUrl);
		// The catalog is itself signed + verified (fail-closed) and carries each
		// list's authoritative version; the per-entry version is cross-checked
		// against the manifest + watchlist at load time. For a cheap poll the
		// signed catalog's entry versions are sufficient to detect a bumped
		// per-list version OR a list add/remove — no N extra manifest fetches.
		const catalog = await this.#deps.loadCatalog(pubkey);
		const versions: Record<string, string> = {};
		for (const entry of catalog.lists) {
			versions[entry.id] = entry.version;
		}
		return compositeVersion(versions);
	}

	/** The active per-list score floors: the configured thresholds, or the
	 * balanced default for every list when no selection thresholds were given. */
	#thresholds(): ListThresholds {
		return this.#selection.thresholds ?? DEFAULT_THRESHOLDS;
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
	async #loadEnabledLists(pubkey: Uint8Array): Promise<LoadedWatchlist[]> {
		const catalog = await this.#deps.loadCatalog(pubkey);
		const enabled = this.#selection.enabledLists;
		const entries =
			enabled === undefined
				? catalog.lists
				: catalog.lists.filter((entry) => enabled.includes(entry.id));
		const loaded: LoadedWatchlist[] = [];
		for (const entry of entries) {
			loaded.push(await this.#deps.loadList(pubkey, entry));
		}
		return loaded;
	}

	async #build(
		config: RuntimeConfig,
		onStage: OnStage,
	): Promise<MultiListScreeningEngine> {
		onStage({ kind: "downloading" });
		const pubkey = await fetchPubkey(config.pubkeyUrl);
		const loaded = await this.#loadEnabledLists(pubkey);
		const versions: Record<string, string> = {};
		for (const l of loaded) {
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
		const embedder = this.#deps.makeEmbedder(onModelProgress);
		this.#embedder = embedder;
		this.#config = config;
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

		const engine = createMultiListScreeningEngine(
			loaded,
			embedder,
			this.#thresholds(),
		);
		this.#ready = engine;
		onStage({ kind: "ready" });
		return engine;
	}
}
