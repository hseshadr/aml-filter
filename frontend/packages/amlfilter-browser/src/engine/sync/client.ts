// Thin main-thread client over the Worker engine. The main thread cannot touch
// OPFS sync access handles, so it only sends typed requests and awaits replies.
// One in-flight map keyed by request id correlates responses to promises.

import { type IdleTimer, startIdleTimer } from "../idleTimeout";
import { fromErrorResponse } from "./errorEnvelope";
import type { EngineOutbound, EngineRequest, EngineResponse } from "./protocol";
import type { OnSyncProgress, SyncResult } from "./types";

interface Pending {
	readonly resolve: (response: EngineResponse) => void;
	readonly reject: (error: Error) => void;
	/** The silence bound. `tick()` on every proof-of-life from the Worker. */
	readonly timer: IdleTimer;
}

/**
 * The maximum time a Worker request may remain SILENT.
 *
 * This bounds a wedged Worker, not a slow one. The whole cold sync (~769 chunks
 * / ~28 MB for /screen's default selection, 1,296 / ~46.7 MB for all four
 * lists) runs inside a single `sync` request, so treating this as a cap on total duration would terminate a
 * perfectly healthy download on any connection slower than roughly 15 Mbps —
 * the visitor sees a Retry banner for what is really just a slow link. Each
 * `sync-progress` tick re-arms the timer, so the budget applies to the gap
 * between chunks rather than to the sum of them.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

interface WorkerLike {
	postMessage(message: EngineRequest): void;
	addEventListener(
		type: "message" | "error" | "messageerror",
		listener:
			| ((event: MessageEvent<EngineOutbound>) => void)
			| ((event: { message?: string }) => void)
			| (() => void),
	): void;
	terminate(): void;
}

export interface EngineClientOptions {
	readonly requestTimeoutMs?: number;
}

export class EngineClient {
	readonly #worker: WorkerLike;
	readonly #pending = new Map<number, Pending>();
	// Per-sync progress sinks, keyed by request id. A `sync-progress` message is
	// routed here instead of settling the pending promise; cleared when the sync
	// finally settles.
	readonly #progress = new Map<number, OnSyncProgress>();
	readonly #timeoutMs: number;
	#nextId = 0;
	#closed: Error | null = null;

	public constructor(worker: WorkerLike, options: EngineClientOptions = {}) {
		this.#worker = worker;
		this.#timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
		this.#worker.addEventListener(
			"message",
			(event: MessageEvent<EngineOutbound>) => {
				this.#onMessage(event.data);
			},
		);
		this.#worker.addEventListener("error", (event: { message?: string }) => {
			this.#close(
				new Error(`engine worker failed: ${event.message ?? "unknown error"}`),
			);
		});
		this.#worker.addEventListener("messageerror", () => {
			this.#close(new Error("engine worker failed: messageerror"));
		});
	}

	/** Spawn the bundled engine Worker (module worker). */
	public static spawn(options?: EngineClientOptions): EngineClient {
		const worker = new Worker(new URL("./worker.ts", import.meta.url), {
			type: "module",
		});
		return new EngineClient(worker as unknown as WorkerLike, options);
	}

	/** Sync the signed bundle at `baseUrl`, pinning the raw pubkey at `pubkeyUrl`.
	 * `onProgress`, when given, receives one tick per fetched chunk (the long
	 * cold-sync phase) via the Worker's one-way `sync-progress` channel.
	 * `wantedPaths`, when given, restricts the sync to part of the bundle. */
	public async sync(
		baseUrl: string,
		pubkeyUrl: string,
		onProgress?: OnSyncProgress,
		wantedPaths?: ReadonlyArray<string>,
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
				// Omitted rather than set to undefined: the protocol distinguishes
				// "no scope" (sync everything) from a scope, and under
				// exactOptionalPropertyTypes an explicit undefined is not the same
				// thing as an absent key.
				...(wantedPaths === undefined ? {} : { wantedPaths }),
			});
			if (response.ok && response.kind === "sync") {
				return response.result;
			}
			throw this.#rejectionFor(response);
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
		throw this.#rejectionFor(response);
	}

	/** Drop the durable store (every chunk + manifest + the active pointer). */
	public async clear(): Promise<void> {
		const response = await this.#send({ kind: "clear", id: this.#allocId() });
		if (!(response.ok && response.kind === "clear")) {
			throw this.#rejectionFor(response);
		}
	}

	public terminate(): void {
		this.#close(new Error("engine worker terminated"));
	}

	#allocId(): number {
		this.#nextId += 1;
		return this.#nextId;
	}

	/** The rejection for a non-success reply, with the Worker's error TYPE intact.
	 * A plain `new Error(response.error)` here would discard `.name` and leave
	 * every downstream type-based branch unreachable in production. */
	#rejectionFor(response: EngineResponse): Error {
		return response.ok
			? new Error("unexpected response kind")
			: fromErrorResponse(response);
	}

	#send(request: EngineRequest): Promise<EngineResponse> {
		if (this.#closed !== null) {
			return Promise.reject(this.#closed);
		}
		return new Promise<EngineResponse>((resolve, reject) => {
			const expire = (): void => {
				this.#close(
					new Error(
						`engine request ${request.id} (${request.kind}) timed out after ${this.#timeoutMs}ms with no progress`,
					),
				);
			};
			const pending: Pending = {
				resolve,
				reject,
				timer: startIdleTimer(this.#timeoutMs, expire),
			};
			this.#pending.set(request.id, pending);
			try {
				this.#worker.postMessage(request);
			} catch (error) {
				this.#pending.delete(request.id);
				pending.timer.cancel();
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	#onMessage(message: EngineOutbound): void {
		// A one-way progress notification: route it to the sync's sink (if any) and
		// return — it must NOT settle the pending sync promise. It IS proof of
		// life, though, so it re-arms the stall timer: a slow-but-moving cold sync
		// must never be terminated for taking longer than one timeout window.
		if ("kind" in message && message.kind === "sync-progress") {
			this.#pending.get(message.id)?.timer.tick();
			this.#progress.get(message.id)?.(message.progress);
			return;
		}
		const pending = this.#pending.get(message.id);
		if (pending === undefined) {
			return;
		}
		this.#pending.delete(message.id);
		pending.timer.cancel();
		pending.resolve(message);
	}

	#close(error: Error): void {
		if (this.#closed !== null) {
			return;
		}
		this.#closed = error;
		for (const pending of this.#pending.values()) {
			pending.timer.cancel();
			pending.reject(error);
		}
		this.#pending.clear();
		this.#progress.clear();
		this.#worker.terminate();
	}
}
