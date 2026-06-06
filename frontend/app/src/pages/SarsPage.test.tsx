import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SarRecord } from "../lib/api";
import { apiClient } from "../lib/api";
import SarsPage from "./SarsPage";

// The page talks to the backend exclusively through the apiClient singleton.
// Mock that seam so the tests drive deterministic responses with no network.
vi.mock("../lib/api", () => ({
	apiClient: {
		listSars: vi.fn(),
		updateSar: vi.fn(),
		exportSar: vi.fn(),
	},
}));

const mockClient = vi.mocked(apiClient);

function makeSar(overrides: Partial<SarRecord> = {}): SarRecord {
	return {
		sar_id: "sar-1",
		tenant_id: "tenant-1",
		customer_id: "cust-1",
		match_id: "match-1",
		jurisdiction: "US",
		template: "FINCEN",
		subject: {
			customer_reference: "REF-001",
			customer_name: "Jon Q. Fakename",
			customer_dob: [],
			customer_identifiers: [],
			matched_sanctioned_name: "SANCTIONED PERSON",
			matched_source_list: "OFAC_SDN",
			match_score: 0.95,
			match_tier: "STRONG",
		},
		suspicious_activity_narrative: "Initial narrative.",
		filer: { name: "Alice", institution: "Acme Bank", contact: "a@acme.test" },
		status: "DRAFT",
		created_by: "api",
		created_at: "2026-06-06T10:00:00Z",
		updated_at: "2026-06-06T10:00:00Z",
		filed_at: null,
		...overrides,
	};
}

function renderPage() {
	return render(
		<MemoryRouter>
			<SarsPage />
		</MemoryRouter>,
	);
}

describe("SarsPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("renders a row per SAR with the sanctioned name and a status badge", async () => {
		mockClient.listSars.mockResolvedValue([
			makeSar({ sar_id: "s-1", status: "DRAFT" }),
			makeSar({
				sar_id: "s-2",
				status: "EXPORTED",
				subject: {
					...makeSar().subject,
					customer_reference: "REF-002",
					matched_sanctioned_name: "OTHER TARGET",
				},
			}),
		]);

		renderPage();

		await waitFor(() =>
			expect(screen.getByText("SANCTIONED PERSON")).toBeInTheDocument(),
		);
		expect(screen.getByText("OTHER TARGET")).toBeInTheDocument();
		expect(
			screen.getByText("DRAFT", { selector: "span.badge" }),
		).toBeInTheDocument();
		expect(
			screen.getByText("EXPORTED", { selector: "span.badge" }),
		).toBeInTheDocument();
	});

	it("calls exportSar with pdf when Export PDF is clicked", async () => {
		mockClient.listSars.mockResolvedValue([makeSar({ sar_id: "s-1" })]);
		mockClient.exportSar.mockResolvedValue(undefined);

		renderPage();

		await waitFor(() =>
			expect(screen.getByText("SANCTIONED PERSON")).toBeInTheDocument(),
		);

		const row = screen.getByText("REF-001").closest("tr");
		if (!row) throw new Error("row not found");
		fireEvent.click(within(row).getByRole("button", { name: /export pdf/i }));

		await waitFor(() =>
			expect(mockClient.exportSar).toHaveBeenCalledWith("s-1", "pdf"),
		);
	});

	it("calls exportSar with json when Export JSON is clicked", async () => {
		mockClient.listSars.mockResolvedValue([makeSar({ sar_id: "s-1" })]);
		mockClient.exportSar.mockResolvedValue(undefined);

		renderPage();

		await waitFor(() =>
			expect(screen.getByText("SANCTIONED PERSON")).toBeInTheDocument(),
		);

		const row = screen.getByText("REF-001").closest("tr");
		if (!row) throw new Error("row not found");
		fireEvent.click(within(row).getByRole("button", { name: /export json/i }));

		await waitFor(() =>
			expect(mockClient.exportSar).toHaveBeenCalledWith("s-1", "json"),
		);
	});

	it("does not offer an edit action for an EXPORTED SAR", async () => {
		mockClient.listSars.mockResolvedValue([
			makeSar({ sar_id: "s-1", status: "EXPORTED" }),
		]);

		renderPage();

		await waitFor(() =>
			expect(screen.getByText("SANCTIONED PERSON")).toBeInTheDocument(),
		);

		const row = screen.getByText("REF-001").closest("tr");
		if (!row) throw new Error("row not found");
		expect(within(row).queryByRole("button", { name: /edit/i })).toBeNull();
	});

	it("edits the narrative via updateSar while not EXPORTED", async () => {
		mockClient.listSars.mockResolvedValue([
			makeSar({ sar_id: "s-1", status: "DRAFT" }),
		]);
		mockClient.updateSar.mockResolvedValue(
			makeSar({
				sar_id: "s-1",
				status: "DRAFT",
				suspicious_activity_narrative: "Updated narrative.",
			}),
		);

		renderPage();

		await waitFor(() =>
			expect(screen.getByText("SANCTIONED PERSON")).toBeInTheDocument(),
		);

		const row = screen.getByText("REF-001").closest("tr");
		if (!row) throw new Error("row not found");
		fireEvent.click(within(row).getByRole("button", { name: /edit/i }));

		fireEvent.change(screen.getByLabelText(/narrative/i), {
			target: { value: "Updated narrative." },
		});
		fireEvent.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() =>
			expect(mockClient.updateSar).toHaveBeenCalledWith("s-1", {
				narrative: "Updated narrative.",
			}),
		);
	});

	it("renders an error alert when loading fails", async () => {
		mockClient.listSars.mockRejectedValue(new Error("boom"));

		renderPage();

		await waitFor(() => expect(screen.getByText(/boom/i)).toBeInTheDocument());
	});
});
