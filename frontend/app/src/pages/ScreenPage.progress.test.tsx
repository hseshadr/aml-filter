import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Drives ScreenPage's boot banner through a loading-model stage, with and
// without progress, asserting the percent renders and the banner stays an
// accessible role="status" line.

type BootStage =
	| { readonly kind: "syncing" }
	| {
			readonly kind: "loading-model";
			readonly progress?: {
				readonly loaded: number;
				readonly total: number;
				readonly pct: number;
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
	}
	return { EngineRuntime, configFromEnv: () => ({}) };
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

	it("renders the plain loading line when there is no progress yet", async () => {
		setScript([{ kind: "loading-model" }]);
		render(<ScreenPage />);
		await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
		const text = screen.getByRole("status").textContent ?? "";
		expect(text).toMatch(/model/i);
		expect(text).not.toMatch(/%/);
	});
});
