// Typed postMessage envelopes between the main thread and the Worker. The Worker
// owns the durable store + sync engine; the main thread only sends requests + awaits
// replies. Discriminated unions on `kind` / `ok` keep the bridge type-safe.

import type { SyncProgress, SyncResult } from "./types";

/** Sync the signed bundle at `baseUrl`, pinning the raw pubkey at `pubkeyUrl`. */
export interface SyncRequest {
	readonly kind: "sync";
	readonly id: number;
	readonly baseUrl: string;
	readonly pubkeyUrl: string;
	/** Restrict the sync to part of the bundle (see `syncIndex`'s `wantedPaths`).
	 * Omitted = the whole bundle, so an old caller behaves exactly as before. */
	readonly wantedPaths?: ReadonlyArray<string>;
}

/** Materialize a synced file's bytes from the active manifest. */
export interface ReadFileRequest {
	readonly kind: "readFile";
	readonly id: number;
	readonly path: string;
}

/** Drop the durable store (every chunk + manifest + the active pointer). */
export interface ClearRequest {
	readonly kind: "clear";
	readonly id: number;
}

export type EngineRequest = SyncRequest | ReadFileRequest | ClearRequest;

interface SyncOk {
	readonly ok: true;
	readonly id: number;
	readonly kind: "sync";
	readonly result: SyncResult;
}

interface ReadFileOk {
	readonly ok: true;
	readonly id: number;
	readonly kind: "readFile";
	readonly bytes: Uint8Array;
}

interface ClearOk {
	readonly ok: true;
	readonly id: number;
	readonly kind: "clear";
}

/**
 * A failed request. `errorName` carries the thrown value's `.name` as DATA —
 * structured clone drops prototypes, so this is the only thing that survives the
 * boundary to tell a fail-closed `SignatureError` apart from an unknown failure.
 * Build it with `toErrorResponse` and consume it with `fromErrorResponse`
 * (errorEnvelope.ts) rather than by hand.
 */
export interface EngineErr {
	readonly ok: false;
	readonly id: number;
	readonly error: string;
	readonly errorName: string;
}

export type EngineResponse = SyncOk | ReadFileOk | ClearOk | EngineErr;

/** A one-way cold-sync download progress notification, correlated to its sync
 * request by `id` but NOT settling it. Tagged `kind: "sync-progress"` so the
 * client routes it to the sync's progress sink instead of resolving the pending
 * promise (mirrors the embedder Worker's `type: "progress"` channel). */
export interface SyncProgressMessage {
	readonly kind: "sync-progress";
	readonly id: number;
	readonly progress: SyncProgress;
}

/** Everything the Worker may post to the main-thread client. */
export type EngineOutbound = EngineResponse | SyncProgressMessage;
