import { afterEach, describe, expect, it, vi } from "vitest";
import type { Embedder } from "./embedder";
import {
	EngineRuntime,
	MODEL_LOAD_TIMEOUT_MS,
	type RuntimeConfig,
	type RuntimeDeps,
	withTimeout,
} from "./runtime";
import type { SyncResult } from "./types";

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const CONFIG: RuntimeConfig = {
	bundleBaseUrl: "https://cdn.example/bundle",
	pubkeyUrl: "https://app.example/public.key",
};

const SYNC_RESULT: SyncResult = {
	version: "test",
	manifestHash: "deadbeef",
	chunksFetched: 0,
	chunksReused: 0,
	bytesFetched: 0,
};

/** A sync engine whose readFile is never reached when warmup hangs. */
function fakeEngine() {
	return {
		sync: () => Promise.resolve(SYNC_RESULT),
		readFile: () => Promise.resolve(new Uint8Array()),
	};
}

/** An embedder whose embed() never settles — the boot-hang condition. */
function neverEmbedder(): Embedder {
	return { embed: () => new Promise<Float32Array>(() => {}) };
}

describe("withTimeout", () => {
	it("passes through the value of a promise that settles before the deadline", async () => {
		await expect(withTimeout(Promise.resolve(42), 1000, "nope")).resolves.toBe(
			42,
		);
	});

	it("rejects with the message when the inner promise never settles", async () => {
		vi.useFakeTimers();
		const pending = withTimeout(
			new Promise<number>(() => {}),
			5000,
			"warmup stalled",
		);
		const assertion = expect(pending).rejects.toThrow("warmup stalled");
		await vi.advanceTimersByTimeAsync(5000);
		await assertion;
	});

	it("does not reject after the inner promise already resolved", async () => {
		vi.useFakeTimers();
		const resolved = withTimeout(
			Promise.resolve("ok"),
			5000,
			"should not fire",
		);
		await expect(resolved).resolves.toBe("ok");
		// Advancing past the deadline must not produce an unhandled rejection.
		await vi.advanceTimersByTimeAsync(5000);
	});
});

describe("EngineRuntime bootstrap timeout", () => {
	function deps(embedder: Embedder): RuntimeDeps {
		return {
			spawnEngine: () => fakeEngine(),
			makeEmbedder: () => embedder,
		};
	}

	it("rejects with the model-load timeout message when warmup never settles", async () => {
		vi.useFakeTimers();
		const runtime = new EngineRuntime(deps(neverEmbedder()));
		const pending = runtime.bootstrap(CONFIG);
		const assertion = expect(pending).rejects.toThrow(/model/i);
		await vi.advanceTimersByTimeAsync(MODEL_LOAD_TIMEOUT_MS);
		await assertion;
	});

	it("clears the memo on timeout so a later boot re-attempts the warmup", async () => {
		vi.useFakeTimers();
		// Both warmups hang; we only assert that #build re-ran (embed called
		// again), which is impossible unless the rejected memo was cleared.
		const embed = vi
			.fn<Embedder["embed"]>()
			.mockImplementation(() => new Promise<Float32Array>(() => {}));
		const runtime = new EngineRuntime(deps({ embed }));

		const first = runtime.bootstrap(CONFIG);
		const firstAssert = expect(first).rejects.toThrow();
		await vi.advanceTimersByTimeAsync(MODEL_LOAD_TIMEOUT_MS);
		await firstAssert;
		expect(embed).toHaveBeenCalledTimes(1);

		const second = runtime.bootstrap(CONFIG);
		const secondAssert = expect(second).rejects.toThrow();
		await vi.advanceTimersByTimeAsync(MODEL_LOAD_TIMEOUT_MS);
		await secondAssert;
		// A fresh #build ran (warmup re-attempted) — the rejected memo was cleared.
		expect(embed).toHaveBeenCalledTimes(2);
	});
});
