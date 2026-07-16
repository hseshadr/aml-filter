// Main-thread client that drives the embedder Worker. Presents the same Embedder
// interface as the in-process embedder so the search engine is agnostic to where
// the model runs; the Worker keeps model load + inference off the UI thread.
//
// Worker→client messages are a discriminated union tagged by an explicit `type`
// field: `result` replies (correlated by id) and one-way `progress`
// notifications. The client switches on `type` with an exhaustive default that
// throws on an unknown tag, so a malformed or future message can never be
// silently mis-routed — the two channels never cross-wire.

import type { Embedder, OnEmbedProgress } from "./embedder";
import type {
	EmbedRequest,
	EmbedResponse,
	ProgressMessage,
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
	terminate?(): void;
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
		// Switch on the explicit `type` tag. The default branch makes the union
		// exhaustive: an unknown tag is a programming/protocol error, surfaced
		// loudly rather than silently dropped.
		switch (message.type) {
			case "result":
				this.#settle(message);
				return;
			case "progress":
				this.#emitProgress(message);
				return;
			default:
				throw new Error(
					`embedder worker sent an unknown message type: ${
						(message as { readonly type: string }).type
					}`,
				);
		}
	}

	#emitProgress(message: ProgressMessage): void {
		this.#onProgress?.({
			loaded: message.loaded,
			total: message.total,
			pct: message.pct,
		});
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

	public dispose(): void {
		for (const pending of this.#pending.values()) {
			pending.reject(new Error("embedder has been disposed"));
		}
		this.#pending.clear();
		this.#worker.terminate?.();
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
