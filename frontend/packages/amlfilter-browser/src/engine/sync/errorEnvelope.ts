// The Worker → main-thread error envelope, and its inverse.
//
// WHY THIS FILE EXISTS
// --------------------
// `postMessage` structured-clones its payload. Structured clone copies data, not
// prototypes: a `SignatureError` posted across the boundary arrives as a plain
// object, and an `Error` rebuilt from `response.error` alone arrives as a plain
// `Error` whose `.name` is `"Error"`.
//
// Every consumer that branches on the failure — the app's bundle-error registry
// (`bootErrorMessage.ts`) most of all — classifies by `.name`, deliberately
// duck-typed so it survives this boundary "without instanceof coupling". That
// only works if something actually carries `.name` across. Before this module
// nothing did, so a fail-closed `SignatureError` reached the UI indistinguishable
// from an unknown failure and rendered "Local screening engine unavailable —
// Close another AML-Filter tab", i.e. the product's core security claim
// reporting itself as a tab conflict.
//
// WHY A DISCRIMINANT AND NOT FULL SERIALIZE/REHYDRATE
// --------------------------------------------------
// The classification contract is exactly `.name` + `.message` (+ `.status` for
// HTTP-shaped failures, which these are not — see `@edgeproc/errors`'s `raw.ts`).
// Carrying the discriminant restores every branch with a one-field protocol
// change. Reconstructing real class instances would need a name→constructor
// registry in the client, which re-introduces the coupling the duck-typing was
// chosen to avoid, and would let a Worker-supplied string decide which class the
// main thread instantiates. `.name` is data; keep it data.

import type { EngineErr } from "./protocol";

/** The `.name` used when a non-`Error` value is thrown (matching `String(v)`
 * fallback semantics: there is no name to carry, so classification falls through
 * to the message-text rules, exactly as it does for a same-thread throw). */
const UNTYPED_ERROR_NAME = "Error";

/** The two fields that have to cross a Worker boundary for a failure to stay
 * classifiable. Shared by every Worker protocol in this package. */
export interface ErrorPayload {
	readonly error: string;
	readonly errorName: string;
}

/**
 * Flatten a thrown value into the clonable `{ error, errorName }` pair. Use this
 * from ANY Worker's catch block; `rebuildError` is its inverse on the client.
 */
export function errorPayload(error: unknown): ErrorPayload {
	const isError = error instanceof Error;
	return {
		error: isError ? error.message : String(error),
		errorName: isError ? error.name : UNTYPED_ERROR_NAME,
	};
}

/**
 * Build the sync Worker's error reply. Carries the thrown value's `.name`
 * alongside its `.message` so the main thread can rebuild an error the registry
 * classifies identically to the one that was actually thrown.
 */
export function toErrorResponse(id: number, error: unknown): EngineErr {
	return { ok: false, id, ...errorPayload(error) };
}

/**
 * Rebuild a main-thread `Error` from the Worker's reply, restoring `.name`.
 *
 * The result is a plain `Error` — not a re-instantiated `SignatureError` — but it
 * is indistinguishable to every `.name`-based consumer, which is the whole
 * classification surface. `.stack` still points at the main thread; the Worker's
 * stack is not part of the contract and is not reconstructed.
 */
export function rebuildError(payload: ErrorPayload): Error {
	const error = new Error(payload.error);
	error.name = payload.errorName;
	return error;
}

/** {@link rebuildError}, typed for the sync Worker's reply envelope. */
export function fromErrorResponse(response: EngineErr): Error {
	return rebuildError(response);
}
