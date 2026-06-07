import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvailableList, ListConfigResponse } from "../lib/api";
import { apiClient } from "../lib/api";
import ListsPage from "./ListsPage";

// The page talks to the backend exclusively through the apiClient singleton.
// Mock that seam so the tests drive deterministic responses with no network.
vi.mock("../lib/api", () => ({
	apiClient: {
		listLists: vi.fn(),
		getAvailableLists: vi.fn(),
		updateListConfig: vi.fn(),
	},
}));

const mockClient = vi.mocked(apiClient);

function makeConfig(
	overrides: Partial<ListConfigResponse> = {},
): ListConfigResponse {
	return {
		list_id: "OFAC_SDN",
		enabled: true,
		version_override: null,
		current_version: "2026-06-01",
		updated_at: "2026-06-06T10:00:00Z",
		...overrides,
	};
}

function makeAvailable(list_id: string): AvailableList {
	return { list_id };
}

function rowFor(listId: string): HTMLElement {
	const cell = screen.getByText(listId);
	const row = cell.closest("tr");
	if (!row) throw new Error(`row for ${listId} not found`);
	return row;
}

describe("ListsPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.listLists.mockResolvedValue([]);
		mockClient.getAvailableLists.mockResolvedValue([]);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders a row per available list merged with its tenant config", async () => {
		mockClient.getAvailableLists.mockResolvedValue([
			makeAvailable("OFAC_SDN"),
			makeAvailable("EU_CONSOLIDATED"),
		]);
		mockClient.listLists.mockResolvedValue([
			makeConfig({ list_id: "OFAC_SDN", enabled: true }),
		]);

		render(<ListsPage />);

		await waitFor(() => expect(rowFor("OFAC_SDN")).toBeInTheDocument());
		expect(rowFor("EU_CONSOLIDATED")).toBeInTheDocument();

		// Configured + enabled OFAC shows its current version + an Active badge.
		expect(
			within(rowFor("OFAC_SDN")).getByText("2026-06-01"),
		).toBeInTheDocument();
		expect(
			within(rowFor("OFAC_SDN")).getByText("Active", {
				selector: "span.badge",
			}),
		).toBeInTheDocument();
	});

	it("shows an available-but-unconfigured list as disabled and unchecked", async () => {
		mockClient.getAvailableLists.mockResolvedValue([makeAvailable("UK_OFSI")]);
		mockClient.listLists.mockResolvedValue([]);

		render(<ListsPage />);

		await waitFor(() => expect(rowFor("UK_OFSI")).toBeInTheDocument());
		const row = rowFor("UK_OFSI");
		const toggle = within(row).getByRole("checkbox");
		expect(toggle).not.toBeChecked();
		expect(
			within(row).getByText("Disabled", { selector: "span.badge" }),
		).toBeInTheDocument();
	});

	it("toggling an unconfigured list calls updateListConfig with enabled:true and reflects it", async () => {
		mockClient.getAvailableLists.mockResolvedValue([
			makeAvailable("UN_CONSOLIDATED"),
		]);
		mockClient.listLists.mockResolvedValue([]);
		mockClient.updateListConfig.mockResolvedValue(
			makeConfig({ list_id: "UN_CONSOLIDATED", enabled: true }),
		);

		render(<ListsPage />);
		await waitFor(() => expect(rowFor("UN_CONSOLIDATED")).toBeInTheDocument());

		fireEvent.click(within(rowFor("UN_CONSOLIDATED")).getByRole("checkbox"));

		await waitFor(() =>
			expect(mockClient.updateListConfig).toHaveBeenCalledWith(
				"UN_CONSOLIDATED",
				{ enabled: true },
			),
		);
		await waitFor(() =>
			expect(
				within(rowFor("UN_CONSOLIDATED")).getByRole("checkbox"),
			).toBeChecked(),
		);
	});

	it("toggling an enabled list off calls updateListConfig with enabled:false", async () => {
		mockClient.getAvailableLists.mockResolvedValue([makeAvailable("OFAC_SDN")]);
		mockClient.listLists.mockResolvedValue([
			makeConfig({ list_id: "OFAC_SDN", enabled: true }),
		]);
		mockClient.updateListConfig.mockResolvedValue(
			makeConfig({ list_id: "OFAC_SDN", enabled: false }),
		);

		render(<ListsPage />);
		await waitFor(() => expect(rowFor("OFAC_SDN")).toBeInTheDocument());

		fireEvent.click(within(rowFor("OFAC_SDN")).getByRole("checkbox"));

		await waitFor(() =>
			expect(mockClient.updateListConfig).toHaveBeenCalledWith("OFAC_SDN", {
				enabled: false,
			}),
		);
	});

	it("renders an error alert when loading lists fails", async () => {
		mockClient.getAvailableLists.mockRejectedValue(new Error("boom"));

		render(<ListsPage />);

		await waitFor(() => expect(screen.getByText(/boom/i)).toBeInTheDocument());
	});

	it("shows an error alert when a toggle update fails", async () => {
		mockClient.getAvailableLists.mockResolvedValue([makeAvailable("OFAC_SDN")]);
		mockClient.listLists.mockResolvedValue([
			makeConfig({ list_id: "OFAC_SDN", enabled: false }),
		]);
		mockClient.updateListConfig.mockRejectedValue(new Error("update failed"));

		render(<ListsPage />);
		await waitFor(() => expect(rowFor("OFAC_SDN")).toBeInTheDocument());

		fireEvent.click(within(rowFor("OFAC_SDN")).getByRole("checkbox"));

		await waitFor(() =>
			expect(screen.getByText(/update failed/i)).toBeInTheDocument(),
		);
	});
});
