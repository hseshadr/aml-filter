// Unmount lifecycle for ScreenPage's page-owned EngineRuntime. The page builds
// its OWN runtime (bounded OFAC selection) while the workstation routes hold a
// SECOND, module-level runtime — so leaving /screen must release this page's
// embedder Worker + ONNX WASM heap, or an SPA visit to /settings (or any
// workstation route) keeps two live runtimes and ~2× the ~23 MB model heap for
// the rest of the session: an OOM trigger under iOS Safari's tab budget.
// StrictMode's dev mount→unmount→remount must NOT dispose — its surviving
// mount reuses the same runtime and the `started` boot guard never re-boots.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";

// Every fake runtime the page constructed, in construction order — each with
// its boot count and dispose spy, so a test can assert the invariant that
// matters: a runtime that BOOTED (spawned workers) is disposed on real unmount.
interface FakeRuntimeRecord {
	bootCalls: number;
	readonly dispose: Mock<() => Promise<void>>;
}
const runtimes: FakeRuntimeRecord[] = [];

// The page builds its own EngineRuntime; mock the module so the test drives a
// deterministic engine with no Worker/bundle/model.
vi.mock("@amlfilter/browser", async (importActual) => {
	const actual = await importActual<typeof import("@amlfilter/browser")>();
	class EngineRuntime {
		// The real runtime always exposes this, and /screen reads it to state the
		// age of the list it screens against. A mock without it would leave the page
		// permanently reporting "age unknown".
		catalogLists() {
			return Promise.resolve([
				{
					id: "OFAC_SDN",
					title: "OFAC SDN",
					version: "demo-1",
					entitiesCount: 1,
					fetchedAt: "2026-08-01T08:00:00Z",
					agedFrom: "fetchedAt",
					sourceUpdatedAt: null,
					stale: false,
					staleReason: null,
				},
			]);
		}
		readonly #record: FakeRuntimeRecord;
		public constructor() {
			this.#record = { bootCalls: 0, dispose: vi.fn(() => Promise.resolve()) };
			runtimes.push(this.#record);
		}
		bootstrap(): Promise<void> {
			this.#record.bootCalls += 1;
			return Promise.resolve();
		}
		engine() {
			return {
				allEntities: () => [],
				screen: () =>
					Promise.resolve({
						request_id: "t",
						list_versions_used: {},
						execution_time_ms: 1,
						matches: [],
					}),
			};
		}
		dispose(): Promise<void> {
			return this.#record.dispose();
		}
	}
	return {
		...actual,
		EngineRuntime,
		configFromEnv: () => ({}),
		// Force "supported" so the boot proceeds: the real engineSupport reads
		// globalThis, and jsdom lacks Worker/OPFS, which would otherwise route
		// every test to the unsupported-device screen.
		engineSupport: () => ({ supported: true, missing: [] }),
	};
});

import { ScreenPage } from "./ScreenPage";

afterEach(() => {
	cleanup();
	runtimes.length = 0;
});

// Wait until the search box is enabled (boot resolved).
async function readyBox(): Promise<void> {
	await waitFor(() => {
		const el = screen.getByPlaceholderText(/Search a name/);
		expect((el as HTMLInputElement).disabled).toBe(false);
	});
}

/** The runtimes that actually booted (spawned workers) — the ones that hold
 * releasable resources and therefore MUST be disposed on real unmount. */
function bootedRuntimes(): FakeRuntimeRecord[] {
	return runtimes.filter((r) => r.bootCalls > 0);
}

/** The booted runtime at `index`; each caller has already asserted it exists. */
function bootedRuntimeAt(index: number): FakeRuntimeRecord {
	const record = bootedRuntimes()[index];
	if (record === undefined) {
		throw new Error(`unreachable: no booted runtime at index ${index}`);
	}
	return record;
}

describe("ScreenPage — runtime disposal on unmount", () => {
	it("disposes its page-owned runtime when the page unmounts", async () => {
		const { unmount } = render(<ScreenPage />);
		await readyBox();
		expect(bootedRuntimes()).toHaveLength(1);
		expect(bootedRuntimeAt(0).dispose).not.toHaveBeenCalled();

		unmount();

		// Disposal is deferred one macrotask (the StrictMode-cancel window), so
		// wait for it rather than asserting synchronously.
		await waitFor(() =>
			expect(bootedRuntimeAt(0).dispose).toHaveBeenCalledTimes(1),
		);
	});

	it("StrictMode's throwaway first pass never disposes the runtime the surviving mount uses", async () => {
		const { unmount } = render(
			<StrictMode>
				<ScreenPage />
			</StrictMode>,
		);
		await readyBox();
		// Give the deferred-disposal window ample time to (wrongly) fire: a naive
		// cleanup-dispose would tear down the engine right here, leaving the
		// replayed mount a dead page (its boot guard never re-boots).
		await new Promise((resolve) => setTimeout(resolve, 30));
		for (const record of runtimes) {
			expect(record.dispose).not.toHaveBeenCalled();
		}

		unmount();

		// The REAL unmount still releases every runtime that booted.
		await waitFor(() => {
			for (const record of bootedRuntimes()) {
				expect(record.dispose).toHaveBeenCalled();
			}
			expect(bootedRuntimes().length).toBeGreaterThan(0);
		});
	});

	it("a fresh mount after unmount boots its own new runtime cleanly", async () => {
		const first = render(<ScreenPage />);
		await readyBox();
		first.unmount();
		await waitFor(() =>
			expect(bootedRuntimeAt(0).dispose).toHaveBeenCalledTimes(1),
		);

		// The /screen → away → /screen journey: the second visit constructs a NEW
		// runtime and boots it; the first one's disposal cannot clobber it.
		render(<ScreenPage />);
		await readyBox();
		expect(bootedRuntimes()).toHaveLength(2);
		expect(bootedRuntimeAt(1).dispose).not.toHaveBeenCalled();
	});
});
