// Main-thread client that drives the embedder Worker. Presents the same Embedder
// interface as the in-process embedder so the search engine is agnostic to where
// the model runs; the Worker keeps model load + inference off the UI thread.
//
// Worker→client messages are a discriminated union: request/response replies
// (correlated by id) and one-way `progress` notifications. The client routes the
// former through the pending-request map and forwards the latter to an optional
// onProgress sink — the two never cross-wire.

import type { Embedder, OnEmbedProgress } from "./embedder";
import type {
	EmbedRequest,
	EmbedResponse,
	WorkerMessage,
} from "./embedderWorker";

/** A minimal Worker surface — what this client needs, so it is easy to fake. */
export interface WorkerLike {
	postMessage(
		message: EmbedRequest,
		transfer: ReadonlyArray<Transferable>,
	): void;
	addEventListener(
		type: "message",
		listener: (event: MessageEvent<WorkerMessage>) => void,
	): void;
}

/** Spawns the embedder Worker as an ES module. */
export function spawnEmbedderWorker(): Worker {
	return new Worker(new URL("./embedderWorker.ts", import.meta.url), {
		type: "module",
	});
}

class WorkerEmbedder implements Embedder {
	readonly #worker: WorkerLike;
	readonly #onProgress: OnEmbedProgress | undefined;
	readonly #pending = new Map<
		number,
		{ resolve: (v: Float32Array) => void; reject: (e: Error) => void }
	>();
	#nextId = 0;

	public constructor(worker: WorkerLike, onProgress?: OnEmbedProgress) {
		this.#worker = worker;
		this.#onProgress = onProgress;
		this.#worker.addEventListener("message", (event) => {
			this.#route(event.data);
		});
	}

	#route(message: WorkerMessage): void {
		// `kind` is present only on the one-way progress notification; its absence
		// marks a request/response reply. This is the discriminant that keeps
		// progress out of the pending-request correlation.
		if ("kind" in message) {
			this.#onProgress?.({
				loaded: message.loaded,
				total: message.total,
				pct: message.pct,
			});
			return;
		}
		this.#settle(message);
	}

	#settle(response: EmbedResponse): void {
		const entry = this.#pending.get(response.id);
		if (entry === undefined) {
			return;
		}
		this.#pending.delete(response.id);
		if (response.ok) {
			entry.resolve(response.vector);
		} else {
			entry.reject(new Error(response.error));
		}
	}

	public embed(text: string): Promise<Float32Array> {
		const id = this.#nextId;
		this.#nextId += 1;
		return new Promise<Float32Array>((resolve, reject) => {
			this.#pending.set(id, { resolve, reject });
			this.#worker.postMessage({ id, text }, []);
		});
	}
}

/** Wrap a Worker (or Worker-like) as an Embedder, forwarding model-download
 * progress to an optional sink. */
export function createWorkerEmbedder(
	worker: WorkerLike,
	onProgress?: OnEmbedProgress,
): Embedder {
	return new WorkerEmbedder(worker, onProgress);
}
