// Thin main-thread client over the Worker engine. The main thread cannot touch
// OPFS sync access handles, so it only sends typed requests and awaits replies.
// One in-flight map keyed by request id correlates responses to promises.

import type { EngineOutbound, EngineRequest, EngineResponse } from "./protocol";
import type { OnSyncProgress, SyncResult } from "./types";

interface Pending {
	readonly resolve: (response: EngineResponse) => void;
	readonly reject: (error: Error) => void;
}

export class EngineClient {
	readonly #worker: Worker;
	readonly #pending = new Map<number, Pending>();
	// Per-sync progress sinks, keyed by request id. A `sync-progress` message is
	// routed here instead of settling the pending promise; cleared when the sync
	// finally settles.
	readonly #progress = new Map<number, OnSyncProgress>();
	#nextId = 0;

	public constructor(worker: Worker) {
		this.#worker = worker;
		this.#worker.addEventListener(
			"message",
			(event: MessageEvent<EngineOutbound>) => {
				this.#onMessage(event.data);
			},
		);
	}

	/** Spawn the bundled engine Worker (module worker). */
	public static spawn(): EngineClient {
		const worker = new Worker(new URL("./worker.ts", import.meta.url), {
			type: "module",
		});
		return new EngineClient(worker);
	}

	/** Sync the signed bundle at `baseUrl`, pinning the raw pubkey at `pubkeyUrl`.
	 * `onProgress`, when given, receives one tick per fetched chunk (the long
	 * cold-sync phase) via the Worker's one-way `sync-progress` channel. */
	public async sync(
		baseUrl: string,
		pubkeyUrl: string,
		onProgress?: OnSyncProgress,
	): Promise<SyncResult> {
		const id = this.#allocId();
		if (onProgress !== undefined) {
			this.#progress.set(id, onProgress);
		}
		try {
			const response = await this.#send({
				kind: "sync",
				id,
				baseUrl,
				pubkeyUrl,
			});
			if (response.ok && response.kind === "sync") {
				return response.result;
			}
			throw new Error(this.#errorOf(response));
		} finally {
			this.#progress.delete(id);
		}
	}

	/** Materialize a synced file's bytes from the active manifest. */
	public async readFile(path: string): Promise<Uint8Array> {
		const response = await this.#send({
			kind: "readFile",
			id: this.#allocId(),
			path,
		});
		if (response.ok && response.kind === "readFile") {
			return response.bytes;
		}
		throw new Error(this.#errorOf(response));
	}

	/** Drop the durable store (every chunk + manifest + the active pointer). */
	public async clear(): Promise<void> {
		const response = await this.#send({ kind: "clear", id: this.#allocId() });
		if (!(response.ok && response.kind === "clear")) {
			throw new Error(this.#errorOf(response));
		}
	}

	public terminate(): void {
		this.#worker.terminate();
	}

	#allocId(): number {
		this.#nextId += 1;
		return this.#nextId;
	}

	#errorOf(response: EngineResponse): string {
		return response.ok ? "unexpected response kind" : response.error;
	}

	#send(request: EngineRequest): Promise<EngineResponse> {
		return new Promise<EngineResponse>((resolve, reject) => {
			this.#pending.set(request.id, { resolve, reject });
			this.#worker.postMessage(request);
		});
	}

	#onMessage(message: EngineOutbound): void {
		// A one-way progress notification: route it to the sync's sink (if any) and
		// return — it must NOT settle the pending sync promise.
		if ("kind" in message && message.kind === "sync-progress") {
			this.#progress.get(message.id)?.(message.progress);
			return;
		}
		const pending = this.#pending.get(message.id);
		if (pending === undefined) {
			return;
		}
		this.#pending.delete(message.id);
		pending.resolve(message);
	}
}
