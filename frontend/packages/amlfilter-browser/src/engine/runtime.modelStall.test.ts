// The model-load bound, asserted through the runtime that applies it.
//
// `modelLoadBound.test.ts` pins the primitive. This file pins the WIRING: that
// the runtime feeds the idle timer from the model's progress at all, and that it
// feeds it from the RAW sink rather than the throttled one.
//
// That distinction is not cosmetic. `throttleModelProgress` deliberately drops
// every tick that would not change the rendered banner value. Keying proof-of-
// life off the throttled sink would mean a download that is moving but has not
// yet advanced a whole percent looks silent — which on a 23 MB model over a slow
// link is a several-second window of manufactured silence, repeatedly.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BundleSource } from "./bundleSource";
import type { EmbedProgress, OnEmbedProgress } from "./embedder";
import { FRESH_RESOLVED } from "./freshnessFixtures";
import {
	EngineRuntime,
	MODEL_LOAD_IDLE_TIMEOUT_MS,
	type RuntimeDeps,
} from "./runtime";
import type { WatchlistCatalog } from "./watchlist";

const CATALOG: WatchlistCatalog = {
	schema: 1,
	generatedAt: "2026-08-01T00:00:00Z",
	lists: [
		{
			id: "OFAC_SDN",
			title: "OFAC SDN",
			version: "2026-08-01",
			entitiesCount: 19_181,
			path: "ofac/",
			...FRESH_RESOLVED,
		},
	],
};

const SOURCE: BundleSource = {
	loadCatalog: () => CATALOG,
	loadList: () => Promise.reject(new Error("not used in streaming residency")),
	loadListMetadata: (entry) =>
		Promise.resolve({
			listId: entry.id,
			version: entry.version,
			entities: [],
		} as never),
	version: () => "2026-08-01",
	clear: () => Promise.resolve(),
	dispose: () => undefined,
};

/**
 * A warmup that never settles on its own, but reports progress on demand — the
 * shape of a real model download: a long pending `embed()` with a stream of
 * ticks underneath it.
 */
function stallableEmbedderDeps(): {
	readonly deps: RuntimeDeps;
	/** Emit one model-progress tick, as the transport meter would. */
	readonly progress: (value: EmbedProgress) => void;
	/** Let the warmup embed finally succeed. */
	readonly finish: () => void;
} {
	let emit: OnEmbedProgress = () => undefined;
	let settle: (vector: Float32Array) => void = () => undefined;
	const deps: RuntimeDeps = {
		makeEmbedder: (onProgress) => {
			emit = onProgress;
			return {
				embed: () =>
					new Promise<Float32Array>((resolve) => {
						settle = resolve;
					}),
				dispose: () => undefined,
			} as never;
		},
		clearCache: () => Promise.resolve(),
		openBundleSource: () => Promise.resolve(SOURCE),
	};
	return {
		deps,
		progress: (value) => {
			emit(value);
		},
		finish: () => {
			settle(new Float32Array(8));
		},
	};
}

const CONFIG = {
	bundleBaseUrl: "/bundle/origin",
	pubkeyUrl: "/public.key",
} as const;
const SELECTION = {
	enabledLists: ["OFAC_SDN"],
	residency: "streaming",
} as const;

describe("the runtime's model-load bound", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("lets a slow-but-progressing model download finish, far past 120 s", async () => {
		const { deps, progress, finish } = stallableEmbedderDeps();
		const runtime = new EngineRuntime(deps);
		const boot = runtime.bootstrap(CONFIG, undefined, SELECTION);

		// ~10 minutes of steady download — a 23 MB model at roughly 0.3 Mbps.
		// The old 120 s wall clock killed this at the two-minute mark.
		let loaded = 0;
		for (let index = 0; index < 20; index += 1) {
			await vi.advanceTimersByTimeAsync(30_000);
			loaded += 1_150_000;
			progress({ loaded, total: 23_000_000 });
		}
		finish();

		await expect(boot).resolves.toBeDefined();
	});

	it("counts a tick the BANNER THROTTLE would discard as proof of life", async () => {
		// THE MUTANT KILLER. Every tick here reports the same rendered value, so
		// `throttleModelProgress` swallows all of them. If the idle timer were fed
		// from the throttled sink it would see total silence and reject.
		const { deps, progress, finish } = stallableEmbedderDeps();
		const runtime = new EngineRuntime(deps);
		const boot = runtime.bootstrap(CONFIG, undefined, SELECTION);

		for (let index = 0; index < 6; index += 1) {
			await vi.advanceTimersByTimeAsync(MODEL_LOAD_IDLE_TIMEOUT_MS / 2);
			progress({ loaded: 1_000, total: 23_000_000, pct: 0 });
		}
		finish();

		await expect(boot).resolves.toBeDefined();
	});

	it("still rejects a model load that has genuinely gone silent", async () => {
		// The guard has to keep firing, or this is not a fix but a deletion.
		const { deps } = stallableEmbedderDeps();
		const runtime = new EngineRuntime(deps);
		const boot = runtime.bootstrap(CONFIG, undefined, SELECTION);
		const assertion = expect(boot).rejects.toThrow(
			/timed out .* with no progress/,
		);

		await vi.advanceTimersByTimeAsync(MODEL_LOAD_IDLE_TIMEOUT_MS + 1_000);

		await assertion;
	});

	it("rejects with text the error registry still classifies as a timeout", async () => {
		// `bootErrorMessage.ts` matches /timeout|timed out/i. Losing that phrase
		// silently downgrades a stalled model to "Local screening engine
		// unavailable — Close another AML-Filter tab."
		const { deps } = stallableEmbedderDeps();
		const runtime = new EngineRuntime(deps);
		const boot = runtime.bootstrap(CONFIG, undefined, SELECTION);
		const assertion = expect(boot).rejects.toThrow(/timed out/i);

		await vi.advanceTimersByTimeAsync(MODEL_LOAD_IDLE_TIMEOUT_MS + 1_000);

		await assertion;
	});

	it("stops progressing the deadline once the warmup settles", async () => {
		const { deps, progress, finish } = stallableEmbedderDeps();
		const runtime = new EngineRuntime(deps);
		const boot = runtime.bootstrap(CONFIG, undefined, SELECTION);
		await vi.advanceTimersByTimeAsync(1_000);
		progress({ loaded: 23_000_000, total: 23_000_000, pct: 100 });
		finish();
		await expect(boot).resolves.toBeDefined();

		// No timer outlives the work it bounded — a stray one would fire an
		// unhandled rejection into the visitor's console long after boot.
		expect(vi.getTimerCount()).toBe(0);
	});
});
