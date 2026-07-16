// @amlfilter/browser — the in-browser tier of aml-filter.
//
// Delta-sync a signed, content-addressed watchlist bundle (the ONLY catalog/list
// path), verify its detached ed25519 signature (fail-closed) against a pinned
// key, decode the precomputed name vectors, and screen a name entirely in the
// tab — no backend. The publisher
// (frontend/packages/amlfilter-publisher) and this browser consumer share one
// wire format (see docs/WATCHLIST_FORMAT.md) and one explainable scoring
// contract (see ./engine/domain + ./engine/scoring): the wire format, the
// normalizer, and the scorer's full output (score, reasons, and each reason's
// description) are parity-tested against the Python side, and the scorer is a
// faithful port of DefaultScoringPolicy (identical weights, thresholds, and
// signal order) — so an in-browser match reproduces the server's score and
// explanation.
//
// Primary entry point: EngineRuntime.bootstrap() → MultiListScreeningEngine.

// --- the signed-bundle delta-sync path: open + materialize a signed bundle ---
export {
	type BundleSource,
	type BundleSourceDeps,
	openBundleSource,
} from "./engine/bundleSource";
// --- device-support preflight: is the local engine runnable on this browser? ---
export {
	type CapabilityScope,
	DeviceUnsupportedError,
	detectCapabilities,
	type EngineCapabilities,
	engineSupport,
	isEngineSupported,
	missingCapabilities,
} from "./engine/deviceSupport";
// --- the domain contract (single source of truth, mirrors the backend) ---
export {
	type Alias,
	EMPTY_IDENTIFIERS,
	type Entity,
	type EntityType,
	type Identifiers,
	type Match,
	type MatchReason,
	type OfacBundleMeta,
	type RiskCategory,
	type ScreenQuery,
	type ScreenResponse,
} from "./engine/domain";
// --- the embedder seam (transformers.js in production, stubbable in tests) ---
export {
	EMBEDDING_DIM,
	EMBEDDING_DTYPE,
	EMBEDDING_MODEL,
	type Embedder,
} from "./engine/embedder";
// --- the multi-list screen: one warm embedder, N signed lists, one contract ---
export {
	createMultiListScreeningEngine,
	createStreamingMultiListScreeningEngine,
	type ListThresholds,
	MultiListScreeningEngine,
	type StreamingListSource,
} from "./engine/multiEngine";
// --- the canonical-name pipeline (shared by the engine and the UI's gates) ---
export { canonicalize, normalizeDob } from "./engine/normalize";
// --- runtime: bootstrap the multi-list engine over the signed catalog + lists ---
export {
	BOOT_TIMEOUT_MS,
	type BootStage,
	bootTimeoutMs,
	type CatalogListInfo,
	compositeVersion,
	configFromEnv,
	createEmbedder,
	defaultRuntimeDeps,
	EngineRuntime,
	type OnStage,
	type RuntimeConfig,
	type RuntimeDeps,
	type RuntimeSelection,
} from "./engine/runtime";
// --- the scoring port: preset weights/threshold + the explainable signals ---
export {
	computeScore,
	PRESETS,
	type Preset,
	type PresetConfig,
	type ScoreResult,
	type ScoringQuery,
	type ScoringWeights,
} from "./engine/scoring";
// --- the screen surface + its option/return contracts ---
export {
	createScreeningEngine,
	ScreeningEngine,
	type ScreenOptions,
} from "./engine/screeningEngine";
// --- storage-quota preflight: refuse fail-fast rather than hang mid-sync ---
export { QuotaError } from "./engine/sync/storage";
// --- cold-sync download progress shape (threaded into the downloading banner) ---
export type { OnSyncProgress, SyncProgress } from "./engine/sync/types";
// --- the bundle-files builder + the shared watchlist/catalog shapes ---
export {
	type BundleListFiles,
	type BundleListMeta,
	buildLoadedFromBundleFiles,
	buildLoadedWatchlist,
	buildLoadedWatchlistMetadataFromBundleFiles,
	type LoadedWatchlist,
	type LoadedWatchlistMetadata,
	type Watchlist,
	type WatchlistCatalog,
	type WatchlistCatalogEntry,
	type WatchlistEntity,
	WatchlistFormatError,
	type WatchlistManifest,
} from "./engine/watchlist";
