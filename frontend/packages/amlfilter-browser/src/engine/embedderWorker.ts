// Worker entry that owns the transformers.js model: the ~23 MB weight download
// and the ONNX inference run off the main thread. One concern only — embed a
// query string and reply with the normalized vector over postMessage. The model
// is loaded once on the first request and cached by createEmbedder().
//
// During that first load transformers.js streams download progress; the worker
// forwards each tick to the client as a one-way `progress` message so the boot
// banner can show a real percent. Every worker→client message carries an
// explicit `type` tag — "result" | "progress" — so the client routes on the tag
// rather than on the structural presence of a field. Progress ticks are tagged
// with the id of the request whose embed triggered the load (captured by
// closure, not read from a mutable global), so the tag is correct even if a
// future change lets embeds overlap.

/// <reference lib="webworker" />

import { createEmbedder, type Embedder, type EmbedProgress } from "./embedder";

/** A request to embed one query string, correlated by id. */
export interface EmbedRequest {
	readonly id: number;
	readonly text: string;
}

/** The reply: the embedding vector, or an error message, for a request id.
 * `type: "result"` is the explicit discriminant against {@link ProgressMessage}. */
export type EmbedResponse =
	| {
			readonly type: "result";
			readonly ok: true;
			readonly id: number;
			readonly vector: Float32Array;
	  }
	| {
			readonly type: "result";
			readonly ok: false;
			readonly id: number;
			readonly error: string;
	  };

/** A one-way model-download progress notification (no request/response pairing);
 * `type: "progress"` discriminates it from {@link EmbedResponse} at the client. */
export interface ProgressMessage extends EmbedProgress {
	readonly type: "progress";
	/** The request id whose load is reporting progress. */
	readonly id: number;
}

/** Everything the worker may post to the client, tagged by `type`. */
export type WorkerMessage = EmbedResponse | ProgressMessage;

let embedder: Embedder | undefined;

/**
 * Build (once) the embedder whose model-load progress is tagged with `id`.
 * The id is captured by closure here — NOT read from a mutable module global
 * inside the callback — so progress ticks carry the id of the request that
 * actually triggered the load even if a future change lets embeds overlap.
 *
 * Invariant today: exactly one embed is in flight during the single model load
 * (the first request), so the embedder built here is the cached one. A second
 * concurrent request reuses this same embedder and never re-enters the load, so
 * no in-flight progress can be mis-tagged.
 */
function embedderFor(id: number): Embedder {
	if (embedder === undefined) {
		embedder = createEmbedder((progress) => postProgress(id, progress));
	}
	return embedder;
}

function postProgress(id: number, progress: EmbedProgress): void {
	const message: ProgressMessage = { type: "progress", id, ...progress };
	self.postMessage(message);
}

self.addEventListener("message", (event: MessageEvent<EmbedRequest>) => {
	const req = event.data;
	embedderFor(req.id)
		.embed(req.text)
		.then((vector) => {
			const response: EmbedResponse = {
				type: "result",
				ok: true,
				id: req.id,
				vector,
			};
			// Transfer the underlying buffer to avoid a copy across the boundary.
			self.postMessage(response, [vector.buffer]);
		})
		.catch((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			const response: EmbedResponse = {
				type: "result",
				ok: false,
				id: req.id,
				error: message,
			};
			self.postMessage(response);
		});
});
