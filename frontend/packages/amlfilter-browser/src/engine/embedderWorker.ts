// Worker entry that owns the transformers.js model: the ~25 MB weight download
// and the ONNX inference run off the main thread. One concern only — embed a
// query string and reply with the normalized vector over postMessage. The model
// is loaded once on the first request and cached by createEmbedder().
//
// During that first load transformers.js streams download progress; the worker
// forwards each tick to the client as a one-way `progress` message so the boot
// banner can show a real percent. Progress messages are tagged with the request
// id whose embed triggered the load, and are discriminated from the normal
// request/response replies by the `kind` field.

/// <reference lib="webworker" />

import { createEmbedder, type Embedder, type EmbedProgress } from "./embedder";

/** A request to embed one query string, correlated by id. */
export interface EmbedRequest {
	readonly id: number;
	readonly text: string;
}

/** The reply: the embedding vector, or an error message, for a request id. */
export type EmbedResponse =
	| { readonly ok: true; readonly id: number; readonly vector: Float32Array }
	| { readonly ok: false; readonly id: number; readonly error: string };

/** A one-way model-download progress notification (no request/response pairing);
 * `kind` discriminates it from {@link EmbedResponse} at the client. */
export interface ProgressMessage extends EmbedProgress {
	readonly kind: "progress";
	/** The request id whose load is reporting progress. */
	readonly id: number;
}

/** Everything the worker may post to the client. */
export type WorkerMessage = EmbedResponse | ProgressMessage;

let embedder: Embedder | undefined;
// The id of the request currently driving the (one-time) model load, so its
// progress ticks can be tagged. Set per request before the embed call.
let activeId = 0;

function postProgress(progress: EmbedProgress): void {
	const message: ProgressMessage = {
		kind: "progress",
		id: activeId,
		...progress,
	};
	self.postMessage(message);
}

function getEmbedder(): Embedder {
	if (embedder === undefined) {
		embedder = createEmbedder(postProgress);
	}
	return embedder;
}

self.addEventListener("message", (event: MessageEvent<EmbedRequest>) => {
	const req = event.data;
	activeId = req.id;
	getEmbedder()
		.embed(req.text)
		.then((vector) => {
			const response: EmbedResponse = { ok: true, id: req.id, vector };
			// Transfer the underlying buffer to avoid a copy across the boundary.
			self.postMessage(response, [vector.buffer]);
		})
		.catch((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			const response: EmbedResponse = { ok: false, id: req.id, error: message };
			self.postMessage(response);
		});
});
