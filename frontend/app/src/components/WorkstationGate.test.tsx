import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { workstation } from "../lib/workstation";
import WorkstationGate from "./WorkstationGate";

vi.mock("../lib/workstation", () => ({
	workstation: vi.fn(),
}));

const mockWorkstation = vi.mocked(workstation);

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
