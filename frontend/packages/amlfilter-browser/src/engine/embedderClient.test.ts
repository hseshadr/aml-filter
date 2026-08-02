import { describe, expect, it, vi } from "vitest";
import { createWorkerEmbedder, type WorkerLike } from "./embedderClient";
import type { EmbedRequest, WorkerMessage } from "./embedderWorker";
import { errorPayload } from "./sync/errorEnvelope";
import { WatchlistFormatError } from "./watchlist";

// A controllable Worker double: captures the message listener so a test can
// push worker→client messages by hand, and records what the client posts.
function fakeWorker() {
	let listener: ((event: MessageEvent<WorkerMessage>) => void) | undefined;
	const posted: EmbedRequest[] = [];
	const worker: WorkerLike = {
		postMessage(message) {
			posted.push(message);
		},
		addEventListener(_type, cb) {
			listener = cb;
		},
	};
	const emit = (data: WorkerMessage): void => {
		listener?.({ data } as MessageEvent<WorkerMessage>);
	};
	return { worker, posted, emit };
}

describe("WorkerEmbedder message routing", () => {
	it("resolves a pending embed with a result message correlated by id", async () => {
		const { worker, posted, emit } = fakeWorker();
		const embedder = createWorkerEmbedder(worker);

		const pending = embedder.embed("ivan");
		const first = posted[0];
		if (first === undefined) {
			throw new Error("expected the embed request to be posted");
		}
		const id = first.id;
		const vector = new Float32Array([1, 2, 3]);
		emit({ type: "result", ok: true, id, vector });

		await expect(pending).resolves.toBe(vector);
	});

	it("routes a progress message to the onProgress sink, not the result resolver", async () => {
		const { worker, emit } = fakeWorker();
		const onProgress = vi.fn();
		const embedder = createWorkerEmbedder(worker, onProgress);

		embedder.embed("ivan");
		// A progress message must NOT settle the pending request — it has no id
		// match in the pending map and is a one-way notification.
		emit({ type: "progress", id: 0, loaded: 10, total: 100, pct: 10 });

		expect(onProgress).toHaveBeenCalledTimes(1);
		expect(onProgress).toHaveBeenCalledWith({
			loaded: 10,
			total: 100,
			pct: 10,
		});
	});

	it("does not cross-wire: a progress message leaves the request pending", async () => {
		const { worker, posted, emit } = fakeWorker();
		const onProgress = vi.fn();
		const embedder = createWorkerEmbedder(worker, onProgress);

		const pending = embedder.embed("ivan");
		const first = posted[0];
		if (first === undefined) {
			throw new Error("expected the embed request to be posted");
		}
		const id = first.id;
		emit({ type: "progress", id, loaded: 50, total: 100, pct: 50 });

		const settled = await Promise.race([
			pending.then(() => "settled"),
			Promise.resolve("still-pending"),
		]);
		expect(settled).toBe("still-pending");

		// The real result still resolves the request afterwards.
		const vector = new Float32Array([9]);
		emit({ type: "result", ok: true, id, vector });
		await expect(pending).resolves.toBe(vector);
	});

	it("rejects a pending embed with an error result message", async () => {
		const { worker, posted, emit } = fakeWorker();
		const embedder = createWorkerEmbedder(worker);

		const pending = embedder.embed("boom");
		const first = posted[0];
		if (first === undefined) {
			throw new Error("expected the embed request to be posted");
		}
		const id = first.id;
		emit({
			type: "result",
			ok: false,
			id,
			...errorPayload(new WatchlistFormatError("kaboom")),
		});

		await expect(pending).rejects.toThrow("kaboom");
		// The type must cross the embedder boundary too, not just the message.
		await expect(pending).rejects.toMatchObject({
			name: "WatchlistFormatError",
		});
	});

	it("tolerates a progress message when no onProgress sink is wired", () => {
		const { worker, emit } = fakeWorker();
		createWorkerEmbedder(worker);
		expect(() =>
			emit({ type: "progress", id: 0, loaded: 1, total: 2, pct: 50 }),
		).not.toThrow();
	});

	it("throws on an unknown message type instead of silently dropping it", () => {
		const { worker, emit } = fakeWorker();
		createWorkerEmbedder(worker);
		// A malformed / future message with an unrecognized tag must surface
		// loudly — the exhaustive default is the protocol guard.
		const bogus = { type: "bogus", id: 0 } as unknown as WorkerMessage;
		expect(() => emit(bogus)).toThrow(/unknown message type: bogus/);
	});
});
