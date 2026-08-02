// EngineClient behavior over a scripted fake Worker. The client is a pure
// request/response correlator — it allocates ids, posts typed requests, and
// settles the matching pending promise when a typed reply arrives — so a fake
// Worker that records posted requests and lets the test emit replies exercises
// the full contract with no OPFS and no real module Worker.

import { afterEach, describe, expect, it, vi } from "vitest";
import { SignatureError } from "../crypto";
import { EngineClient } from "./client";
import { toErrorResponse } from "./errorEnvelope";
import type { EngineOutbound, EngineRequest } from "./protocol";
import type { SyncProgress, SyncResult } from "./types";

/** A scripted stand-in for the engine Worker: records every posted request and
 * lets the test deliver typed responses through the client's message listener. */
class FakeWorker {
	public readonly posted: EngineRequest[] = [];
	public terminated = false;
	#listener: ((event: MessageEvent<EngineOutbound>) => void) | undefined;
	#errorListener: ((event: { message?: string }) => void) | undefined;
	#messageErrorListener: (() => void) | undefined;

	public addEventListener(
		type: "message" | "error" | "messageerror",
		listener:
			| ((event: MessageEvent<EngineOutbound>) => void)
			| ((event: { message?: string }) => void)
			| (() => void),
	): void {
		if (type === "message") {
			this.#listener = listener as (
				event: MessageEvent<EngineOutbound>,
			) => void;
		} else if (type === "error") {
			this.#errorListener = listener as (event: { message?: string }) => void;
		} else {
			this.#messageErrorListener = listener as () => void;
		}
	}

	public postMessage(request: EngineRequest): void {
		this.posted.push(request);
	}

	public terminate(): void {
		this.terminated = true;
	}

	/** Deliver a response (or a one-way progress message) as if the Worker
	 * posted it back. */
	public emit(message: EngineOutbound): void {
		this.#listener?.({ data: message } as MessageEvent<EngineOutbound>);
	}

	public emitError(message: string): void {
		this.#errorListener?.({ message });
	}

	public emitMessageError(): void {
		this.#messageErrorListener?.();
	}
}

function clientOver(): { client: EngineClient; worker: FakeWorker } {
	const worker = new FakeWorker();
	return { client: new EngineClient(worker as unknown as Worker), worker };
}

/** The id the client allocated for the request at `index` (fails loudly when
 * nothing was posted, so a broken send surfaces as a clear assertion). */
function idAt(worker: FakeWorker, index: number): number {
	const request = worker.posted[index];
	if (request === undefined) {
		throw new Error(`no request was posted at index ${index}`);
	}
	return request.id;
}

const RESULT: SyncResult = {
	version: "v1",
	manifestHash: "h".repeat(64),
	chunksFetched: 2,
	chunksReused: 3,
	bytesFetched: 40,
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("EngineClient request/response correlation", () => {
	it("sync posts a typed request and resolves with the worker's SyncResult", async () => {
		const { client, worker } = clientOver();
		const pending = client.sync("/bundle/origin", "/public.key");
		expect(worker.posted[0]).toMatchObject({
			kind: "sync",
			baseUrl: "/bundle/origin",
			pubkeyUrl: "/public.key",
		});
		worker.emit({
			ok: true,
			id: idAt(worker, 0),
			kind: "sync",
			result: RESULT,
		});
		await expect(pending).resolves.toEqual(RESULT);
	});

	it("routes one-way sync-progress messages to the sync's progress sink without settling it", async () => {
		const { client, worker } = clientOver();
		const seen: SyncProgress[] = [];
		const pending = client.sync("/bundle/origin", "/public.key", (p) =>
			seen.push(p),
		);
		const id = idAt(worker, 0);
		// Two progress ticks arrive BEFORE the final result — they must reach the
		// sink and must NOT resolve the sync promise.
		worker.emit({
			kind: "sync-progress",
			id,
			progress: { fetched: 1, total: 2, bytes: 10 },
		});
		worker.emit({
			kind: "sync-progress",
			id,
			progress: { fetched: 2, total: 2, bytes: 20 },
		});
		expect(seen).toEqual([
			{ fetched: 1, total: 2, bytes: 10 },
			{ fetched: 2, total: 2, bytes: 20 },
		]);
		// The final sync result settles the promise.
		worker.emit({ ok: true, id, kind: "sync", result: RESULT });
		await expect(pending).resolves.toEqual(RESULT);
	});

	it("ignores a sync-progress message with no registered sink (no crash)", async () => {
		const { client, worker } = clientOver();
		// A sync started WITHOUT a progress callback still works when a stray
		// progress message arrives for it.
		const pending = client.sync("/bundle/origin", "/public.key");
		const id = idAt(worker, 0);
		worker.emit({
			kind: "sync-progress",
			id,
			progress: { fetched: 1, total: 1, bytes: 5 },
		});
		worker.emit({ ok: true, id, kind: "sync", result: RESULT });
		await expect(pending).resolves.toEqual(RESULT);
	});

	it("readFile posts the path and resolves the materialized bytes", async () => {
		const { client, worker } = clientOver();
		const pending = client.readFile("ofac/entities.jsonl");
		expect(worker.posted[0]).toMatchObject({
			kind: "readFile",
			path: "ofac/entities.jsonl",
		});
		worker.emit({
			ok: true,
			id: idAt(worker, 0),
			kind: "readFile",
			bytes: new Uint8Array([1, 2, 3]),
		});
		await expect(pending).resolves.toEqual(new Uint8Array([1, 2, 3]));
	});

	it("clear resolves on the worker's ok reply", async () => {
		const { client, worker } = clientOver();
		const pending = client.clear();
		expect(worker.posted[0]).toMatchObject({ kind: "clear" });
		worker.emit({ ok: true, id: idAt(worker, 0), kind: "clear" });
		await expect(pending).resolves.toBeUndefined();
	});

	it("rejects with the worker's error message AND type on an ok:false reply", async () => {
		const { client, worker } = clientOver();
		const pending = client.sync("/bundle/origin", "/public.key");
		// Built with the production serializer, not by hand: a test that hand-rolls
		// the envelope proves nothing about what the Worker actually sends.
		worker.emit(
			toErrorResponse(
				idAt(worker, 0),
				new SignatureError("latest pointer failed signature verify"),
			),
		);
		await expect(pending).rejects.toThrow(
			"latest pointer failed signature verify",
		);
		await expect(pending).rejects.toMatchObject({ name: "SignatureError" });
	});

	it("clear rejects with the worker's error message on an ok:false reply", async () => {
		const { client, worker } = clientOver();
		const pending = client.clear();
		worker.emit(toErrorResponse(idAt(worker, 0), new Error("store is locked")));
		await expect(pending).rejects.toThrow("store is locked");
	});

	it("rejects 'unexpected response kind' when an ok reply has the wrong kind", async () => {
		const { client, worker } = clientOver();
		const pending = client.readFile("catalog.json");
		// An ok reply of the WRONG kind must not be forced into readFile's shape.
		worker.emit({ ok: true, id: idAt(worker, 0), kind: "clear" });
		await expect(pending).rejects.toThrow(/unexpected response kind/);
	});

	it("rejects a sync whose ok reply carries a non-sync kind", async () => {
		const { client, worker } = clientOver();
		const pending = client.sync("/bundle/origin", "/public.key");
		worker.emit({ ok: true, id: idAt(worker, 0), kind: "clear" });
		await expect(pending).rejects.toThrow(/unexpected response kind/);
	});

	it("correlates out-of-order replies to concurrent requests by id", async () => {
		const { client, worker } = clientOver();
		const first = client.readFile("a");
		const second = client.readFile("b");
		// Ids are allocated per request, monotonically.
		expect(idAt(worker, 1)).toBeGreaterThan(idAt(worker, 0));
		// Answer the SECOND request first: each promise still gets its own bytes.
		worker.emit({
			ok: true,
			id: idAt(worker, 1),
			kind: "readFile",
			bytes: new Uint8Array([2]),
		});
		worker.emit({
			ok: true,
			id: idAt(worker, 0),
			kind: "readFile",
			bytes: new Uint8Array([1]),
		});
		await expect(second).resolves.toEqual(new Uint8Array([2]));
		await expect(first).resolves.toEqual(new Uint8Array([1]));
	});

	it("ignores a reply whose id has no pending request", async () => {
		const { client, worker } = clientOver();
		// A stray reply (e.g. after a duplicate post) must not crash the client…
		worker.emit({ ok: true, id: 999, kind: "clear" });
		// …and a later real request still settles normally.
		const pending = client.clear();
		worker.emit({ ok: true, id: idAt(worker, 0), kind: "clear" });
		await expect(pending).resolves.toBeUndefined();
	});

	it("terminate tears down the underlying worker", () => {
		const { client, worker } = clientOver();
		client.terminate();
		expect(worker.terminated).toBe(true);
	});

	it("rejects every pending request when the worker crashes", async () => {
		const { client, worker } = clientOver();
		const pending = client.readFile("catalog.json");
		worker.emitError("module failed to evaluate");
		await expect(pending).rejects.toThrow(/module failed to evaluate/);
	});

	it("rejects a pending request on message deserialization failure", async () => {
		const { client, worker } = clientOver();
		const pending = client.clear();
		worker.emitMessageError();
		await expect(pending).rejects.toThrow(/messageerror/);
	});

	it("bounds a silent request and terminates the worker", async () => {
		const worker = new FakeWorker();
		const client = new EngineClient(worker as unknown as Worker, {
			requestTimeoutMs: 5,
		});
		const pending = client.readFile("catalog.json");
		await expect(pending).rejects.toThrow(/timed out/);
		expect(worker.terminated).toBe(true);
	});

	it("terminate rejects pending requests instead of leaving them hanging", async () => {
		const { client, worker } = clientOver();
		const pending = client.sync("/bundle/origin", "/public.key");
		client.terminate();
		await expect(pending).rejects.toThrow(/terminated/);
		expect(worker.terminated).toBe(true);
	});
});

/**
 * The cold sync of the production bundle is ~1,296 chunks / ~48 MB and it all
 * lives inside ONE `sync` request. A fixed request cap therefore doubles as a
 * hard cap on total download time: a visitor on a slow link gets the worker
 * terminated mid-download and an error banner, even though the sync was healthy
 * and still moving.
 *
 * The timeout must bound SILENCE (a wedged worker), not DURATION (a slow link).
 * Every `sync-progress` tick is proof of life and must re-arm the timer.
 */
describe("EngineClient stall timeout (progress is proof of life)", () => {
	const progressFor = (id: number, fetched: number): EngineOutbound => ({
		kind: "sync-progress",
		id,
		progress: { fetched, total: 1296, bytes: fetched * 37_000 },
	});

	it("does NOT time out a sync that keeps reporting progress past the cap", async () => {
		vi.useFakeTimers();
		try {
			const worker = new FakeWorker();
			const client = new EngineClient(worker as unknown as Worker, {
				requestTimeoutMs: 1_000,
			});
			const pending = client.sync("/bundle/origin", "/public.key");
			const id = worker.posted[0]?.id ?? 1;

			// Six stall-windows' worth of wall clock, but a tick every 600ms —
			// exactly the shape of a slow-but-healthy cold sync.
			for (let i = 1; i <= 10; i += 1) {
				await vi.advanceTimersByTimeAsync(600);
				worker.emit(progressFor(id, i * 100));
			}
			expect(worker.terminated).toBe(false);

			worker.emit({
				ok: true,
				id,
				kind: "sync",
				result: {
					version: "2026-08-01",
					fetchedBytes: 1,
					reusedChunks: 0,
				} as unknown as SyncResult,
			} as EngineOutbound);
			await expect(pending).resolves.toMatchObject({ version: "2026-08-01" });
		} finally {
			vi.useRealTimers();
		}
	});

	it("still terminates a sync that goes silent for the whole window", async () => {
		vi.useFakeTimers();
		try {
			const worker = new FakeWorker();
			const client = new EngineClient(worker as unknown as Worker, {
				requestTimeoutMs: 1_000,
			});
			const pending = client.sync("/bundle/origin", "/public.key");
			const id = worker.posted[0]?.id ?? 1;
			const settled = pending.catch((error: Error) => error);

			// Progress, then silence: the timer re-arms once, then expires.
			await vi.advanceTimersByTimeAsync(600);
			worker.emit(progressFor(id, 100));
			await vi.advanceTimersByTimeAsync(1_001);

			expect(String(await settled)).toMatch(/timed out/);
			expect(worker.terminated).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("EngineClient.spawn", () => {
	it("spawns the bundled sync worker as a module Worker and wires the client", () => {
		const constructed: Array<{ url: string; options?: WorkerOptions }> = [];
		class StubWorker {
			public constructor(url: URL, options?: WorkerOptions) {
				constructed.push({ url: String(url), options });
			}
			public addEventListener(): void {}
			public postMessage(): void {}
			public terminate(): void {}
		}
		vi.stubGlobal("Worker", StubWorker);

		const client = EngineClient.spawn();

		expect(client).toBeInstanceOf(EngineClient);
		expect(constructed).toHaveLength(1);
		// Vitest's URL transform may append a suffix; the module path must be there.
		expect(constructed[0]?.url).toContain("/sync/worker.ts");
		expect(constructed[0]?.options).toEqual({ type: "module" });
	});
});
