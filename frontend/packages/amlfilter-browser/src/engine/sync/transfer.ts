// The transfer list for a Worker→main reply. A `readFile` reply carries a
// materialized file's bytes (an entities.jsonl / vectors.f32 can be many MB); a
// plain postMessage STRUCTURED-CLONES that buffer, so the bytes exist twice at
// once (Worker + main) at peak. Transferring the backing ArrayBuffer instead
// hands ownership to the main thread with zero copy — the same technique the
// embedder Worker already uses for its embedding vector — which lowers peak
// memory on the cold-boot handoff (the iOS per-tab ceiling is the constraint).
// Only `readFile` has a large buffer worth transferring; every other reply is
// tiny and cloned as-is.

import type { EngineResponse } from "./protocol";

/** The transferable buffers for a reply (the readFile bytes, else none). */
export function transferables(response: EngineResponse): Transferable[] {
	if (response.ok && response.kind === "readFile") {
		return [response.bytes.buffer as ArrayBuffer];
	}
	return [];
}
