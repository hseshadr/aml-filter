import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkForWatchlistUpdates } from "../lib/sync";
import { retainWorkstationRuntime, workstation } from "../lib/workstation";
import WorkstationGate, { WATCHLIST_POLL_INTERVAL_MS } from "./WorkstationGate";

vi.mock("../lib/workstation", () => ({
	workstation: vi.fn(),
	retainWorkstationRuntime: vi.fn(() => vi.fn()),
}));

// Mock the sync module so the recurring poll's call to checkForWatchlistUpdates
// is observable/controllable. runWatchlistSync (the once-per-boot path) keeps
// its real, idempotent behavior so the existing strip tests are unaffected.
vi.mock("../lib/sync", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../lib/sync")>();
	return {
		...actual,
		checkForWatchlistUpdates: vi.fn().mockResolvedValue(null),
	};
});

const mockWorkstation = vi.mocked(workstation);
const mockRetainWorkstationRuntime = vi.mocked(retainWorkstationRuntime);
const mockCheckForWatchlistUpdates = vi.mocked(checkForWatchlistUpdates);

type OnStage = Parameters<ReturnType<typeof makeHandle>["engineBoot"]>[0];

function makeHandle(analystName: string | null) {
	return {
		store: {
			getSetting: vi.fn().mockResolvedValue(analystName),
			setSetting: vi.fn().mockResolvedValue(undefined),
		},
		tracker: {},
		onboarding: {},
		engineBoot: vi.fn().mockResolvedValue(undefined),
		// Auto-sync-on-boot reads the loaded version then syncs; default to an
		// unchanged watchlist so the strip stays silent in these tests.
		watchlistVersion: vi.fn(() => "wl-test"),
		rescan: {
			syncWatchlist: vi.fn().mockResolvedValue({
				changed: false,
				version: "wl-test",
				customersScanned: 0,
				newHits: 0,
				clearedHits: 0,
			}),
		},
	};
}

/**
 * Build a handle whose engineBoot captures the onStage callback so tests can
 * drive stage transitions after mount.  engineBoot returns a promise that never
 * settles so stages can be fired manually.
 */
function makeControllableHandle(analystName: string | null) {
	let fireStage!: OnStage;
	let rejectBoot!: (err: Error) => void;
	const engineBoot = vi.fn(
		(onStage: OnStage) =>
			new Promise<void>((_resolve, reject) => {
				fireStage = onStage;
				rejectBoot = reject;
			}),
	);
	const handle = {
		store: {
			getSetting: vi.fn().mockResolvedValue(analystName),
			setSetting: vi.fn().mockResolvedValue(undefined),
		},
		tracker: {},
		onboarding: {},
		engineBoot,
		watchlistVersion: vi.fn(() => "wl-test"),
		rescan: {
			syncWatchlist: vi.fn().mockResolvedValue({
				changed: false,
				version: "wl-test",
				customersScanned: 0,
				newHits: 0,
				clearedHits: 0,
			}),
		},
	};
	return { handle, fireStage: () => fireStage, rejectBoot: () => rejectBoot };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("WorkstationGate", () => {
	it("can render a DB-gated route without eagerly booting the screening model", async () => {
		const handle = makeHandle("Avery Analyst");
		// biome-ignore lint/suspicious/noExplicitAny: structural fake for the mocked seam
		mockWorkstation.mockResolvedValue(handle as any);
		render(
			<WorkstationGate bootEngine={false}>
				<div>SETTINGS CONTENT</div>
			</WorkstationGate>,
		);
		await waitFor(() =>
			expect(screen.getByText("SETTINGS CONTENT")).toBeInTheDocument(),
		);
		expect(handle.engineBoot).not.toHaveBeenCalled();
	});

	it("releases the shared workstation runtime when the gate unmounts", async () => {
		const handle = makeHandle("Avery Analyst");
		const release = vi.fn();
		mockRetainWorkstationRuntime.mockReturnValueOnce(release);
		// biome-ignore lint/suspicious/noExplicitAny: structural fake for the mocked seam
		mockWorkstation.mockResolvedValue(handle as any);
		const { unmount } = render(
			<WorkstationGate bootEngine={false}>
				<div>SETTINGS CONTENT</div>
			</WorkstationGate>,
		);
		await waitFor(() =>
			expect(screen.getByText("SETTINGS CONTENT")).toBeInTheDocument(),
		);

		unmount();

		expect(release).toHaveBeenCalledTimes(1);
	});

	it("does not start an engine boot after the status strip unmounts", async () => {
		const handle = makeHandle("Avery Analyst");
		let resolveStrip!: (value: typeof handle) => void;
		mockWorkstation
			.mockResolvedValueOnce(handle as unknown as never)
			.mockReturnValueOnce(
				new Promise((resolve) => {
					resolveStrip = resolve as unknown as (value: typeof handle) => void;
				}),
			);
		const { unmount } = render(
			<WorkstationGate>
				<div>WORKSTATION CONTENT</div>
			</WorkstationGate>,
		);
		await screen.findByText("WORKSTATION CONTENT");
		unmount();

		resolveStrip(handle);
		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(handle.engineBoot).not.toHaveBeenCalled();
	});

	it("renders children straight away when the analyst name is already set", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: structural fake for the mocked seam
		mockWorkstation.mockResolvedValue(makeHandle("Avery Analyst") as any);
		render(
			<WorkstationGate>
				<div>WORKSTATION CONTENT</div>
			</WorkstationGate>,
		);
		await waitFor(() =>
			expect(screen.getByText("WORKSTATION CONTENT")).toBeInTheDocument(),
		);
	});

	it("prompts once for the analyst name, persists it, then renders children", async () => {
		const handle = makeHandle(null);
		// biome-ignore lint/suspicious/noExplicitAny: structural fake for the mocked seam
		mockWorkstation.mockResolvedValue(handle as any);
		render(
			<WorkstationGate>
				<div>WORKSTATION CONTENT</div>
			</WorkstationGate>,
		);
		// Anchored: the form's aria-label "Set analyst name" must not match.
		const input = await screen.findByLabelText(/^analyst name$/i);
		fireEvent.change(input, { target: { value: "Avery Analyst" } });
		fireEvent.click(screen.getByRole("button", { name: /start reviewing/i }));
		await waitFor(() =>
			expect(screen.getByText("WORKSTATION CONTENT")).toBeInTheDocument(),
		);
		expect(handle.store.setSetting).toHaveBeenCalledWith(
			"analyst_name",
			"Avery Analyst",
		);
	});

	it("shows the boot error with a Retry control when the DB fails to open", async () => {
		mockWorkstation.mockRejectedValueOnce(
			new Error("could not open the local KYC database"),
		);
		// biome-ignore lint/suspicious/noExplicitAny: structural fake for the mocked seam
		mockWorkstation.mockResolvedValueOnce(makeHandle("Avery Analyst") as any);
		render(
			<WorkstationGate>
				<div>WORKSTATION CONTENT</div>
			</WorkstationGate>,
		);
		await waitFor(() =>
			expect(
				screen.getByText(/could not open the local KYC database/i),
			).toBeInTheDocument(),
		);
		fireEvent.click(screen.getByRole("button", { name: /retry/i }));
		await waitFor(() =>
			expect(screen.getByText("WORKSTATION CONTENT")).toBeInTheDocument(),
		);
	});
});

describe("EngineStatusStrip (rendered inside WorkstationGate once ready)", () => {
	it("shows the correct label for each stage as stages fire", async () => {
		const { handle, fireStage } = makeControllableHandle("Avery Analyst");
		// biome-ignore lint/suspicious/noExplicitAny: structural fake for the mocked seam
		mockWorkstation.mockResolvedValue(handle as any);
		render(
			<WorkstationGate>
				<div>WORKSTATION CONTENT</div>
			</WorkstationGate>,
		);
		// Wait until children (and therefore EngineStatusStrip) are mounted.
		await screen.findByText("WORKSTATION CONTENT");
		// engineBoot is invoked in a mount effect; wait for it so the captured
		// onStage is assigned before we fire a stage (otherwise fireStage() is
		// undefined under parallel-worker scheduling — a latent race, not a bug).
		await waitFor(() => expect(handle.engineBoot).toHaveBeenCalled());

		// downloading → "downloading the sanctions list…"
		act(() => fireStage()({ kind: "downloading" }));
		await screen.findByText(/downloading the sanctions list…/i);

		// verified → "preparing the screening index…"
		act(() => fireStage()({ kind: "verified", version: "demo-1" }));
		await screen.findByText(/preparing the screening index…/i);

		// loading-model without progress → no % suffix
		act(() => fireStage()({ kind: "loading-model" }));
		await waitFor(() => {
			const label = screen.getByRole("status", {
				name: (_, el) =>
					(el?.textContent ?? "").includes("loading the name-matching model"),
			});
			expect(label.textContent).toMatch(/loading the name-matching model…$/);
		});

		// loading-model with progress → shows rounded %
		act(() =>
			fireStage()({ kind: "loading-model", progress: { pct: 42.7 } as never }),
		);
		await waitFor(() => {
			const label = screen.getByRole("status", {
				name: (_, el) =>
					(el?.textContent ?? "").includes("loading the name-matching model"),
			});
			expect(label.textContent).toMatch(/43%/);
		});

		// loading-model with bytes but NO total → megabytes, never a made-up %
		act(() =>
			fireStage()({
				kind: "loading-model",
				progress: { loaded: 5_242_880 } as never,
			}),
		);
		await waitFor(() => {
			const label = screen.getByRole("status", {
				name: (_, el) =>
					(el?.textContent ?? "").includes("loading the name-matching model"),
			});
			expect(label.textContent).toMatch(/5\.0 MB/);
			expect(label.textContent).not.toMatch(/%/);
		});
	});

	it("hides the strip once the ready stage fires", async () => {
		const { handle, fireStage } = makeControllableHandle("Avery Analyst");
		// biome-ignore lint/suspicious/noExplicitAny: structural fake for the mocked seam
		mockWorkstation.mockResolvedValue(handle as any);
		render(
			<WorkstationGate>
				<div>WORKSTATION CONTENT</div>
			</WorkstationGate>,
		);
		await screen.findByText("WORKSTATION CONTENT");
		// engineBoot is invoked in a mount effect; wait for it so the captured
		// onStage is assigned before we fire a stage (otherwise fireStage() is
		// undefined under parallel-worker scheduling — a latent race, not a bug).
		await waitFor(() => expect(handle.engineBoot).toHaveBeenCalled());

		// Put something on screen first so we know the strip was visible.
		act(() => fireStage()({ kind: "downloading" }));
		await screen.findByText(/downloading the sanctions list…/i);

		// ready → strip should vanish.
		act(() => fireStage()({ kind: "ready" }));
		await waitFor(() =>
			expect(
				screen.queryByText(/downloading the sanctions list…/i),
			).not.toBeInTheDocument(),
		);
		// Children remain rendered — the gate is not blocking.
		expect(screen.getByText("WORKSTATION CONTENT")).toBeInTheDocument();
	});

	it("shows the non-blocking engine-unavailable warning while still rendering children", async () => {
		const { handle, rejectBoot } = makeControllableHandle("Avery Analyst");
		// biome-ignore lint/suspicious/noExplicitAny: structural fake for the mocked seam
		mockWorkstation.mockResolvedValue(handle as any);
		render(
			<WorkstationGate>
				<div>WORKSTATION CONTENT</div>
			</WorkstationGate>,
		);
		await screen.findByText("WORKSTATION CONTENT");
		// engineBoot is invoked in a mount effect; wait for it so the captured
		// reject is assigned before we call it (otherwise rejectBoot() is undefined
		// under parallel-worker scheduling — a latent race, not a behavior bug).
		await waitFor(() => expect(handle.engineBoot).toHaveBeenCalled());

		// Simulate the engine boot rejecting.
		act(() => rejectBoot()(new Error("FAISS index failed to load")));

		// Warning strip appears…
		await screen.findByText(/screening engine unavailable/i);
		expect(screen.getByText(/FAISS index failed to load/i)).toBeInTheDocument();
		// …but children are STILL rendered (non-blocking).
		expect(screen.getByText("WORKSTATION CONTENT")).toBeInTheDocument();
	});
});

describe("EngineStatusStrip watchlist-update polling", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	// Leak-proof teardown: restore real timers even if a test throws, so React's
	// async act() never runs under fake timers in a later test/file.
	afterEach(() => {
		vi.useRealTimers();
	});

	/**
	 * Mount the gate with an already-named analyst + an immediately-resolving
	 * engineBoot so the strip reaches its ready state and the poll effect is
	 * installed.  Resolves once children (and therefore the poll) are mounted;
	 * returns the handle plus the testing-library `unmount` so a test can tear
	 * the tree down and assert the interval was cleared.
	 */
	async function mountReadyGate() {
		const handle = makeHandle("Avery Analyst");
		// biome-ignore lint/suspicious/noExplicitAny: structural fake for the mocked seam
		mockWorkstation.mockResolvedValue(handle as any);
		const { unmount } = render(
			<WorkstationGate>
				<div>WORKSTATION CONTENT</div>
			</WorkstationGate>,
		);
		await screen.findByText("WORKSTATION CONTENT");
		// The once-per-boot auto-sync runs first; let its microtasks settle so the
		// poll effect is fully installed before we start advancing the clock.
		await act(async () => {
			await Promise.resolve();
		});
		return { handle, unmount };
	}

	it("polls for updates after one interval elapses", async () => {
		const { handle } = await mountReadyGate();
		expect(mockCheckForWatchlistUpdates).not.toHaveBeenCalled();

		await act(async () => {
			vi.advanceTimersByTime(WATCHLIST_POLL_INTERVAL_MS);
		});

		expect(mockCheckForWatchlistUpdates).toHaveBeenCalledTimes(1);
		expect(mockCheckForWatchlistUpdates).toHaveBeenCalledWith(handle);
	});

	it("polls N times after N intervals elapse", async () => {
		await mountReadyGate();

		// One interval at a time, letting each (fast-resolving) poll settle before
		// the next tick — mirrors real 30-min spacing where a check finishes long
		// before the following tick (so the overlap guard never trips here).
		for (let i = 0; i < 3; i++) {
			await act(async () => {
				vi.advanceTimersByTime(WATCHLIST_POLL_INTERVAL_MS);
				await Promise.resolve();
			});
		}

		expect(mockCheckForWatchlistUpdates).toHaveBeenCalledTimes(3);
	});

	it("stops polling after unmount (interval is cleared)", async () => {
		const { unmount } = await mountReadyGate();

		await act(async () => {
			vi.advanceTimersByTime(WATCHLIST_POLL_INTERVAL_MS);
		});
		expect(mockCheckForWatchlistUpdates).toHaveBeenCalledTimes(1);

		// Tear down the tree — the effect cleanup must clearInterval.
		unmount();

		// Many more intervals elapse, but the cleared interval fires nothing more.
		await act(async () => {
			vi.advanceTimersByTime(WATCHLIST_POLL_INTERVAL_MS * 5);
		});
		expect(mockCheckForWatchlistUpdates).toHaveBeenCalledTimes(1);
	});

	it("does not start a second poll while one is still in flight (no overlap)", async () => {
		// A check that never settles: a slow nightly fetch must not let ticks stack.
		let settle!: () => void;
		mockCheckForWatchlistUpdates.mockImplementationOnce(
			() =>
				new Promise<null>((resolve) => {
					settle = () => resolve(null);
				}),
		);
		await mountReadyGate();

		// First tick → starts the (pending) check.
		await act(async () => {
			vi.advanceTimersByTime(WATCHLIST_POLL_INTERVAL_MS);
		});
		expect(mockCheckForWatchlistUpdates).toHaveBeenCalledTimes(1);

		// Two more ticks fire while the first check is STILL pending → skipped.
		await act(async () => {
			vi.advanceTimersByTime(WATCHLIST_POLL_INTERVAL_MS * 2);
		});
		expect(mockCheckForWatchlistUpdates).toHaveBeenCalledTimes(1);

		// Let the in-flight check resolve, then the next tick may run again.
		await act(async () => {
			settle();
			await Promise.resolve();
		});
		await act(async () => {
			vi.advanceTimersByTime(WATCHLIST_POLL_INTERVAL_MS);
		});
		expect(mockCheckForWatchlistUpdates).toHaveBeenCalledTimes(2);
	});

	it("keeps polling after a poll rejects (errors are swallowed)", async () => {
		mockCheckForWatchlistUpdates.mockRejectedValueOnce(
			new Error("transient fetch failure"),
		);
		await mountReadyGate();

		await act(async () => {
			vi.advanceTimersByTime(WATCHLIST_POLL_INTERVAL_MS);
			await Promise.resolve();
		});
		expect(mockCheckForWatchlistUpdates).toHaveBeenCalledTimes(1);

		// A later tick still fires despite the prior rejection.
		await act(async () => {
			vi.advanceTimersByTime(WATCHLIST_POLL_INTERVAL_MS);
		});
		expect(mockCheckForWatchlistUpdates).toHaveBeenCalledTimes(2);
	});
});
