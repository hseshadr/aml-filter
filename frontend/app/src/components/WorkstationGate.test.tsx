import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { workstation } from "../lib/workstation";
import WorkstationGate from "./WorkstationGate";

vi.mock("../lib/workstation", () => ({
	workstation: vi.fn(),
}));

const mockWorkstation = vi.mocked(workstation);

function makeHandle(analystName: string | null) {
	return {
		store: {
			getSetting: vi.fn().mockResolvedValue(analystName),
			setSetting: vi.fn().mockResolvedValue(undefined),
		},
		tracker: {},
		onboarding: {},
		engineBoot: vi.fn().mockResolvedValue(undefined),
	};
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
