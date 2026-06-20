// @amlfilter/browser — the in-browser tier of aml-filter.
//
// Fetch a signed JSON watchlist same-origin, verify its detached ed25519
// signature (fail-closed) against a pinned key, decode the precomputed name
// vectors, and screen a name entirely in the tab — no backend. The publisher
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
	EMBEDDING_MODEL,
	type Embedder,
} from "./engine/embedder";
// --- the multi-list screen: one warm embedder, N signed lists, one contract ---
export {
	createMultiListScreeningEngine,
	type ListThresholds,
	MultiListScreeningEngine,
} from "./engine/multiEngine";
// --- the canonical-name pipeline (shared by the engine and the UI's gates) ---
export { canonicalize } from "./engine/normalize";
// --- runtime: bootstrap the multi-list engine over the signed catalog + lists ---
export {
	type BootStage,
	compositeVersion,
	configFromEnv,
	createEmbedder,
	defaultRuntimeDeps,
	EngineRuntime,
	type LoadCatalog,
	type LoadList,
	type OnStage,
	type RuntimeConfig,
	type RuntimeDeps,
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
// --- the signed-catalog + per-list loaders + their loaded shapes ---
export {
	assertCatalogShape,
	buildLoadedWatchlist,
	fetchListVersion,
	fetchVerifiedCatalog,
	type LoadedWatchlist,
	loadList,
	type Watchlist,
	type WatchlistCatalog,
	type WatchlistCatalogEntry,
	type WatchlistEntity,
	WatchlistFormatError,
	type WatchlistManifest,
} from "./engine/watchlist";
