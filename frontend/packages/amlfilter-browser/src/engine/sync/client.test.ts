// EngineClient behavior over a scripted fake Worker. The client is a pure
// request/response correlator — it allocates ids, posts typed requests, and
// settles the matching pending promise when a typed reply arrives — so a fake
// Worker that records posted requests and lets the test emit replies exercises
// the full contract with no OPFS and no real module Worker.

import { afterEach, describe, expect, it, vi } from "vitest";
import { EngineClient } from "./client";
import type { EngineRequest, EngineResponse } from "./protocol";
import type { SyncResult } from "./types";

/** A scripted stand-in for the engine Worker: records every posted request and
 * lets the test deliver typed responses through the client's message listener. */
class FakeWorker {
	public readonly posted: EngineRequest[] = [];
	public terminated = false;
	#listener: ((event: MessageEvent<EngineResponse>) => void) | undefined;

	public addEventListener(
		_type: "message",
		listener: (event: MessageEvent<EngineResponse>) => void,
	): void {
		this.#listener = listener;
	}

	public postMessage(request: EngineRequest): void {
		this.posted.push(request);
	}

	public terminate(): void {
		this.terminated = true;
	}

	/** Deliver a response as if the Worker posted it back. */
	public emit(response: EngineResponse): void {
		this.#listener?.({ data: response } as MessageEvent<EngineResponse>);
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

	it("rejects with the worker's error message on an ok:false reply", async () => {
		const { client, worker } = clientOver();
		const pending = client.sync("/bundle/origin", "/public.key");
		worker.emit({
			ok: false,
			id: idAt(worker, 0),
			error: "latest pointer failed signature verify",
		});
		await expect(pending).rejects.toThrow(
			"latest pointer failed signature verify",
		);
	});

	it("clear rejects with the worker's error message on an ok:false reply", async () => {
		const { client, worker } = clientOver();
		const pending = client.clear();
		worker.emit({ ok: false, id: idAt(worker, 0), error: "store is locked" });
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
