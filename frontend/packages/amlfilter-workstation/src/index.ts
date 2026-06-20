// @amlfilter/workstation — the local-first KYC tier of aml-filter.
//
// KYC records (read-write, YOUR data) live in SQLite-WASM persisted to OPFS
// behind a dedicated DB Web Worker. The OFAC reference list (read-only,
// someone else's data you must trust) stays on @amlfilter/browser's signed
// fail-closed bundle path — two stores, two trust models.

export { DbClient, type WorkerLike } from "./db/client";
export type { DbErr, DbRequest, DbResponse } from "./db/protocol";
export {
	DuplicateReferenceError,
	decodeWorkerError,
	encodeWorkerError,
	InvalidResolutionError,
	NotFoundError,
} from "./errors";
export {
	type FingerprintEntity,
	type FingerprintProfile,
	materialFingerprint,
} from "./fingerprint";
export {
	LocalOnboardingService,
	type NameScreener,
	ONBOARDING_THRESHOLD,
	type OnboardRequest,
	type OnboardResult,
} from "./onboarding";
export {
	LAST_SYNCED_VERSION_KEY,
	RescanService,
	type RescanSummary,
	type SyncResult,
} from "./rescan";
export {
	ANALYST_NAME_KEY,
	LocalMatchTracker,
	type ResolveOptions,
} from "./review";
export {
	loadScreeningConfig,
	resolveThreshold,
	SCREENING_SENSITIVITY_KEY,
	SCREENING_THRESHOLD_OVERRIDES_KEY,
	type ScreeningConfig,
	type SettingsStore,
	saveScreeningConfig,
	type ThresholdOverrides,
} from "./screening_config";
export {
	type CustomerProfile,
	canonicalProfile,
	tierMatch,
} from "./tier_match";
export { classifyTier, STRONG_TIER_FLOOR } from "./tiering";
export type {
	CreateCustomerPayload,
	CustomerPatch,
	CustomerRow,
	IdDocument,
	MatchEvent,
	MatchEventType,
	MatchReasonJson,
	MatchTier,
	ResolutionStatus,
	ReviewFilters,
	ReviewRow,
	ReviewState,
	TieredMatch,
	WorkstationStore,
} from "./types";
