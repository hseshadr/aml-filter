// @amlfilter/browser — the in-browser tier of aml-filter.
//
// Sync a signed, content-addressed OFAC bundle into OPFS (ed25519 + sha256,
// fail-closed), reassemble its files, and screen a name entirely in the tab —
// no backend. The native (Python) producer and this browser consumer share one
// wire format and one explainable scoring contract (see ./engine/domain +
// ./engine/scoring): the wire format, the MiniLM embedder, and the normalizer are
// parity-tested against the Python side, and the scorer is a faithful port of
// DefaultScoringPolicy (identical weights, thresholds, and signal order) — so an
// in-browser match reproduces the server's score.
//
// Primary entry point: EngineRuntime.bootstrap() → ScreeningEngine.
//
// Low-level sync primitives and the Worker-backed EngineClient live behind the
// `@amlfilter/browser/testing` subpath (test-only seams, not the production
// surface). The reusable, domain-agnostic sync tier lives at
// `@amlfilter/browser/engine`.

// --- the domain contract (single source of truth, mirrors the backend) ---
export type {
	Alias,
	Entity,
	EntityType,
	Match,
	MatchReason,
	OfacBundleMeta,
	RiskCategory,
	ScreenQuery,
	ScreenResponse,
} from "./engine/domain";
// --- the embedder seam (transformers.js in production, stubbable in tests) ---
export {
	EMBEDDING_DIM,
	EMBEDDING_MODEL,
	type Embedder,
} from "./engine/embedder";
// --- runtime: bootstrap the engine over the synced bundle ---
export {
	type BootStage,
	configFromEnv,
	createEmbedder,
	defaultRuntimeDeps,
	type EnginePort,
	EngineRuntime,
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
	type ScreeningBundleFiles,
	ScreeningEngine,
	type ScreenOptions,
} from "./engine/screeningEngine";
// --- the SyncResult shape leaks through BootStage; expose its type only ---
export type { SyncResult } from "./engine/types";
