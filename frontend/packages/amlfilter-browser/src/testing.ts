// @amlfilter/browser/testing — BROWSER-SAFE test-only seams.
//
// These are NOT part of the production runtime surface, but they ARE safe to
// import in a browser (e.g. a Playwright harness): the Worker-backed sync client
// plus the lower-level sync primitives (in-memory CAS store, the syncIndex state
// machine, materializeFile). The production app should depend only on the
// package root entrypoint.

// --- the Worker-backed sync client ---
export { EngineClient } from "./engine/client";
// --- the in-memory content-addressed store ---
export { MemoryCacheStore } from "./engine/memoryStore";
// --- the sync state machine + file reassembly ---
export { materializeFile, syncIndex } from "./engine/sync";
// --- the seam types the production runtime accepts ---
export type {
	CacheStore,
	FetchBytes,
	IndexManifest,
	SyncResult,
	Verify,
	VersionPointer,
} from "./engine/types";
