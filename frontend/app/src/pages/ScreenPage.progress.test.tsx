import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Drives ScreenPage's boot banner through a loading-model stage, with and
// without progress, asserting the percent renders and the banner stays an
// accessible role="status" line.

type BootStage =
	| {
			readonly kind: "downloading";
			readonly progress?: {
				readonly fetched: number;
				readonly total: number;
				readonly bytes: number;
			};
	  }
	| {
			readonly kind: "loading-model";
			readonly progress?: {
				readonly loaded: number;
				readonly total?: number;
				readonly pct?: number;
			};
	  }
	| { readonly kind: "ready" };

type OnStage = (stage: BootStage) => void;

// A runtime whose bootstrap emits a scripted sequence of stages before settling,
// so the banner is observed mid-load (where the percent must appear).
const stageScript: BootStage[] = [];

vi.mock("@amlfilter/browser", () => {
	class EngineRuntime {
		bootstrap(_config: unknown, onStage: OnStage): Promise<void> {
			for (const stage of stageScript) {
				onStage(stage);
			}
			// Never resolve: keep the page in the booting phase so the banner is
			// the asserted surface.
			return new Promise<void>(() => {});
		}
		engine() {
			return null;
		}
		dispose(): Promise<void> {
			// The page disposes its page-owned runtime on real unmount (deferred one
			// macrotask); a resolved no-op keeps that teardown inert here.
			return Promise.resolve();
		}
	}
	return {
		EngineRuntime,
		configFromEnv: () => ({}),
		// jsdom lacks Worker/OPFS; force "supported" so boot reaches the banner.
		engineSupport: () => ({ supported: true, missing: [] }),
	};
});

import { ScreenPage } from "./ScreenPage";

function setScript(stages: BootStage[]): void {
	stageScript.length = 0;
	stageScript.push(...stages);
}

afterEach(() => {
	cleanup();
	setScript([]);
});

describe("ScreenPage boot banner — model-load progress", () => {
	it("renders the percent when loading-model carries progress", async () => {
		setScript([
			{ kind: "loading-model", progress: { loaded: 42, total: 100, pct: 42 } },
		]);
		render(<ScreenPage />);
		// The boot banner is the role="status" region.
		await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
		expect(screen.getByRole("status").textContent).toMatch(/42\s*%/);
	});

	it("shows megabytes, never a fabricated percent, when no total is known", async () => {
		// A server that withholds content-length leaves no honest denominator.
		// The banner must still move — bytes are always known — but it must not
		// print a percentage derived from a made-up total.
		setScript([{ kind: "loading-model", progress: { loaded: 5_242_880 } }]);
		render(<ScreenPage />);
		await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
		const text = screen.getByRole("status").textContent ?? "";
		expect(text).toMatch(/5(\.0)?\s*MB/i);
		expect(text).not.toMatch(/%/);
	});

	it("renders the plain loading line when there is no progress yet", async () => {
		setScript([{ kind: "loading-model" }]);
		render(<ScreenPage />);
		await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
		const text = screen.getByRole("status").textContent ?? "";
		expect(text).toMatch(/model/i);
		expect(text).not.toMatch(/%/);
	});

	it("shows n/total chunk progress on the downloading stage (not a frozen banner)", async () => {
		setScript([
			{
				kind: "downloading",
				progress: { fetched: 42, total: 1269, bytes: 10 },
			},
		]);
		render(<ScreenPage />);
		await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
		const text = screen.getByRole("status").textContent ?? "";
		expect(text).toMatch(/downloading/i);
		expect(text).toMatch(/42\s*\/\s*1269/);
	});

	it("shows the plain downloading line before any chunk progress arrives", async () => {
		setScript([{ kind: "downloading" }]);
		render(<ScreenPage />);
		await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
		const text = screen.getByRole("status").textContent ?? "";
		expect(text).toMatch(/downloading/i);
		expect(text).not.toMatch(/\//);
	});
});
