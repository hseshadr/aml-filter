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
export { classifyTier, STRONG_TIER_FLOOR } from "./tiering";
export type {
	CreateCustomerPayload,
	CustomerPatch,
	CustomerRow,
	IdDocument,
	MatchReasonJson,
	MatchTier,
	ResolutionStatus,
	ReviewFilters,
	ReviewRow,
	TieredMatch,
	WorkstationStore,
} from "./types";
