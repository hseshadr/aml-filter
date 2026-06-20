import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../lib/api";
import SettingsPage from "./SettingsPage";

// The page talks to the persisted screening config through the apiClient
// singleton, and to the analyst-name settings row through the workstation
// handle's store. Mock both seams so the tests are deterministic and offline.
vi.mock("../lib/api", () => ({
	apiClient: {
		getScreeningConfig: vi.fn(),
		setScreeningConfig: vi.fn(),
	},
}));

const mockGetSetting = vi.fn();
const mockSetSetting = vi.fn().mockResolvedValue(undefined);
vi.mock("../lib/workstation", () => ({
	workstation: vi.fn(async () => ({
		store: { getSetting: mockGetSetting, setSetting: mockSetSetting },
	})),
}));

const mockClient = vi.mocked(apiClient);

describe("SettingsPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.getScreeningConfig.mockResolvedValue({
			sensitivity: "balanced",
			overrides: {},
		});
		mockClient.setScreeningConfig.mockResolvedValue({
			customersScanned: 0,
			newHits: 0,
			clearedHits: 0,
		});
		mockGetSetting.mockResolvedValue(null);
	});

	it("loads the screening config on mount and reflects the sensitivity in the control", async () => {
		mockClient.getScreeningConfig.mockResolvedValue({
			sensitivity: "strict",
			overrides: {},
		});

		render(<SettingsPage />);

		await waitFor(() =>
			expect(screen.getByRole("radio", { name: "Strict" })).toHaveAttribute(
				"aria-checked",
				"true",
			),
		);
	});

	it("selecting a different sensitivity then Apply calls setScreeningConfig with that sensitivity", async () => {
		render(<SettingsPage />);
		await waitFor(() =>
			expect(mockClient.getScreeningConfig).toHaveBeenCalled(),
		);

		fireEvent.click(screen.getByRole("radio", { name: "Strict" }));
		fireEvent.click(screen.getByRole("button", { name: /apply/i }));

		await waitFor(() =>
			expect(mockClient.setScreeningConfig).toHaveBeenCalledWith(
				expect.objectContaining({ sensitivity: "strict" }),
			),
		);
	});

	it("after Apply resolves with a rescan summary, the confirmation banner shows the count", async () => {
		mockClient.setScreeningConfig.mockResolvedValue({
			customersScanned: 3,
			newHits: 1,
			clearedHits: 0,
		});

		render(<SettingsPage />);
		await waitFor(() =>
			expect(mockClient.getScreeningConfig).toHaveBeenCalled(),
		);

		fireEvent.click(screen.getByRole("button", { name: /apply/i }));

		await waitFor(() =>
			expect(screen.getByText(/Re-screened 3 customers/)).toBeInTheDocument(),
		);
	});

	it("choosing a per-list override is included in the setScreeningConfig overrides", async () => {
		render(<SettingsPage />);
		await waitFor(() =>
			expect(mockClient.getScreeningConfig).toHaveBeenCalled(),
		);

		fireEvent.change(screen.getByLabelText(/override for OFAC SDN/i), {
			target: { value: "strict" },
		});
		fireEvent.click(screen.getByRole("button", { name: /apply/i }));

		await waitFor(() =>
			expect(mockClient.setScreeningConfig).toHaveBeenCalledWith(
				expect.objectContaining({ overrides: { OFAC_SDN: "strict" } }),
			),
		);
	});
});
