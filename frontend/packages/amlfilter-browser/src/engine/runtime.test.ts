import { afterEach, describe, expect, it, vi } from "vitest";
import type { Embedder, EmbedProgress } from "./embedder";
import {
	type BootStage,
	EngineRuntime,
	MODEL_LOAD_TIMEOUT_MS,
	modelLoadTimeoutMs,
	parseTimeoutMs,
	type RuntimeConfig,
	type RuntimeDeps,
	throttleByRoundedPct,
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

describe("parseTimeoutMs (model-load timeout override, fail-closed)", () => {
	it("returns the production default when the override is absent", () => {
		expect(parseTimeoutMs(undefined)).toBe(MODEL_LOAD_TIMEOUT_MS);
	});

	it("uses a valid positive numeric override", () => {
		expect(parseTimeoutMs("2500")).toBe(2500);
	});

	it.each([
		"",
		"abc",
		"0",
		"-1",
		"NaN",
		"Infinity",
	])("falls back to the default for the invalid override %p", (raw) => {
		expect(parseTimeoutMs(raw)).toBe(MODEL_LOAD_TIMEOUT_MS);
	});

	it("reads VITE_MODEL_LOAD_TIMEOUT_MS from the env record", () => {
		expect(modelLoadTimeoutMs({ VITE_MODEL_LOAD_TIMEOUT_MS: "1234" })).toBe(
			1234,
		);
	});

	it("falls back to the default when the env var is unset", () => {
		expect(modelLoadTimeoutMs({})).toBe(MODEL_LOAD_TIMEOUT_MS);
	});
});

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

describe("throttleByRoundedPct", () => {
	function progress(pct: number): EmbedProgress {
		return { loaded: pct, total: 100, pct };
	}

	it("emits once for repeated ticks at the same rounded percent", () => {
		const emit = vi.fn();
		const throttled = throttleByRoundedPct(emit);
		// Four sub-percent ticks that all round to 42 → exactly one emit.
		throttled(progress(42.0));
		throttled(progress(42.1));
		throttled(progress(42.4));
		throttled(progress(41.7)); // still rounds to 42
		expect(emit).toHaveBeenCalledTimes(1);
	});

	it("emits again when the rounded percent changes, forwarding precise pct", () => {
		const emit = vi.fn();
		const throttled = throttleByRoundedPct(emit);
		throttled(progress(42.2));
		throttled(progress(43.1)); // rounds to 43 → a new emit
		expect(emit).toHaveBeenCalledTimes(2);
		// The precise pct is forwarded unchanged (the banner rounds for display).
		expect(emit).toHaveBeenNthCalledWith(2, progress(43.1));
	});

	it("caps emissions at ~101 over a full 0→100 sub-percent stream", () => {
		const emit = vi.fn();
		const throttled = throttleByRoundedPct(emit);
		// 1000 ticks evenly from 0 to 100 → at most 101 distinct rounded values.
		for (let i = 0; i <= 1000; i += 1) {
			throttled(progress((i / 1000) * 100));
		}
		expect(emit.mock.calls.length).toBeLessThanOrEqual(101);
	});
});

describe("EngineRuntime model-load progress", () => {
	it("threads an embedder progress event into a loading-model stage", async () => {
		// The embedder factory receives an onProgress sink; this fake fires one
		// progress event during warmup, which the runtime must surface as a
		// loading-model BootStage carrying that progress.
		const deps: RuntimeDeps = {
			spawnEngine: () => fakeEngine(),
			makeEmbedder: (onProgress) => ({
				// Fire one progress tick, then reject — that halts #build before the
				// (out-of-scope) screening-engine assembly while still proving the
				// progress sink reached onStage. The rejection is asserted below.
				embed: () => {
					onProgress({ loaded: 12, total: 24, pct: 50 });
					return Promise.reject(new Error("warmup halted after progress"));
				},
			}),
		};
		const runtime = new EngineRuntime(deps);
		const stages: BootStage[] = [];
		await expect(
			runtime.bootstrap(CONFIG, (s) => stages.push(s)),
		).rejects.toThrow("warmup halted after progress");

		expect(stages).toContainEqual({
			kind: "loading-model",
			progress: { loaded: 12, total: 24, pct: 50 },
		});
		// The plain (progress-less) loading-model stage still fires first.
		expect(stages).toContainEqual({ kind: "loading-model" });
	});
});
