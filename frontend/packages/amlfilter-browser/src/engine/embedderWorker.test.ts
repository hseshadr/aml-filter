import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmbedProgress, OnEmbedProgress } from "./embedder";
import type { EmbedRequest, WorkerMessage } from "./embedderWorker";

// Exercises the worker entry directly: it registers a `message` listener on
// `self` at import time, builds the embedder once via createEmbedder (mocked
// here so no real ~23 MB model loads), and forwards model-load progress tagged
// with the request id that triggered the load. The id is captured by closure
// (embedderFor(id)) rather than read from a mutable global, so an overlapping
// embed cannot mis-tag in-flight progress — the test below pins that.

// The mocked createEmbedder records the onProgress sink it was handed and lets
// the test fire progress ticks on demand, mid-embed.
const onProgressSinks: OnEmbedProgress[] = [];

vi.mock("./embedder", () => {
	let resolveEmbed: ((v: Float32Array) => void) | undefined;
	let rejectEmbed: ((reason: unknown) => void) | undefined;
	return {
		createEmbedder: (onProgress: OnEmbedProgress) => {
			onProgressSinks.push(onProgress);
			return {
				embed: () =>
					new Promise<Float32Array>((resolve, reject) => {
						resolveEmbed = resolve;
						rejectEmbed = reject;
					}),
			};
		},
		// Exposed via the module so the test can settle the in-flight embed.
		__finishEmbed: (): void => resolveEmbed?.(new Float32Array(384)),
		// …or fail it, to drive the worker's error-reply path.
		__failEmbed: (reason: unknown): void => rejectEmbed?.(reason),
	};
});

interface SelfStub {
	readonly addEventListener: (
		type: "message",
		listener: (event: MessageEvent<EmbedRequest>) => void,
	) => void;
	readonly postMessage: (message: WorkerMessage) => void;
	listener?: (event: MessageEvent<EmbedRequest>) => void;
	readonly posted: WorkerMessage[];
}

function installSelf(): SelfStub {
	const posted: WorkerMessage[] = [];
	const stub: SelfStub = {
		posted,
		addEventListener(_type, listener) {
			stub.listener = listener;
		},
		postMessage(message) {
			posted.push(message);
		},
	};
	vi.stubGlobal("self", stub);
	return stub;
}

function send(stub: SelfStub, req: EmbedRequest): void {
	stub.listener?.({ data: req } as MessageEvent<EmbedRequest>);
}

function progress(pct: number): EmbedProgress {
	return { loaded: pct, total: 100, pct };
}

beforeEach(() => {
	onProgressSinks.length = 0;
	vi.resetModules();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("embedderWorker", () => {
	it("tags model-load progress with the id of the embed that triggered the load", async () => {
		const stub = installSelf();
		await import("./embedderWorker");

		send(stub, { id: 7, text: "ivan" });
		const sink = onProgressSinks[0];
		if (sink === undefined) {
			throw new Error("expected createEmbedder to receive a progress sink");
		}
		sink(progress(40));

		expect(stub.posted).toContainEqual({
			type: "progress",
			id: 7,
			loaded: 40,
			total: 100,
			pct: 40,
		});
	});

	it("replies with a tagged result for a settled embed", async () => {
		const stub = installSelf();
		const mod = (await import("./embedder")) as unknown as {
			__finishEmbed: () => void;
		};
		await import("./embedderWorker");

		send(stub, { id: 3, text: "olga" });
		mod.__finishEmbed();
		await Promise.resolve();
		await Promise.resolve();

		const result = stub.posted.find((m) => m.type === "result");
		expect(result).toMatchObject({ type: "result", ok: true, id: 3 });
	});

	it("captures the load-time id by closure: a second overlapping embed cannot re-tag in-flight progress", async () => {
		const stub = installSelf();
		await import("./embedderWorker");

		// First request triggers the (one-time) model load → its sink closes over id 1.
		send(stub, { id: 1, text: "first" });
		// A second request arrives before the load finishes. It reuses the cached
		// embedder and does NOT register a new sink — so only one sink exists.
		send(stub, { id: 2, text: "second" });
		expect(onProgressSinks).toHaveLength(1);

		// Progress fired now still carries id 1, the request that owns the load —
		// the second request can never mis-tag it.
		const sink = onProgressSinks[0];
		if (sink === undefined) {
			throw new Error("expected exactly one progress sink");
		}
		sink(progress(55));

		const progressMsg = stub.posted.find((m) => m.type === "progress");
		expect(progressMsg).toMatchObject({ type: "progress", id: 1 });
	});

	it("replies ok:false with the Error's message AND type when the embed fails", async () => {
		const stub = installSelf();
		const mod = (await import("./embedder")) as unknown as {
			__failEmbed: (reason: unknown) => void;
		};
		await import("./embedderWorker");

		send(stub, { id: 5, text: "boom" });
		mod.__failEmbed(new Error("model load failed"));
		await Promise.resolve();
		await Promise.resolve();

		// `errorName` is part of the envelope: without it a typed model failure
		// reaches the main thread as an untyped Error (see sync/errorEnvelope.ts).
		expect(stub.posted).toContainEqual({
			type: "result",
			ok: false,
			id: 5,
			error: "model load failed",
			errorName: "Error",
		});
	});

	it("stringifies a non-Error rejection into the tagged error reply", async () => {
		const stub = installSelf();
		const mod = (await import("./embedder")) as unknown as {
			__failEmbed: (reason: unknown) => void;
		};
		await import("./embedderWorker");

		send(stub, { id: 6, text: "boom" });
		mod.__failEmbed("wasm out of memory");
		await Promise.resolve();
		await Promise.resolve();

		expect(stub.posted).toContainEqual({
			type: "result",
			ok: false,
			id: 6,
			error: "wasm out of memory",
			errorName: "Error",
		});
	});
});
