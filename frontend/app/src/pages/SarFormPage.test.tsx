import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SarMatchContext, SarRecord } from "../lib/api";
import { apiClient } from "../lib/api";
import SarFormPage from "./SarFormPage";

// The page talks to the backend exclusively through the apiClient singleton.
// Mock that seam so the tests drive deterministic responses with no network.
vi.mock("../lib/api", () => ({
	apiClient: {
		createSar: vi.fn(),
	},
}));

const mockClient = vi.mocked(apiClient);

const matchState: SarMatchContext = {
	match_id: "match-1",
	customer_id: "cust-1",
	customer_reference: "REF-001",
	customer_name: "Jon Q. Fakename",
	sanctioned_name: "SANCTIONED PERSON",
	source_list: "OFAC_SDN",
	match_score: 0.95,
	tier: "STRONG",
};

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
		suspicious_activity_narrative: null,
		filer: { name: "", institution: "", contact: "" },
		status: "DRAFT",
		created_by: "api",
		created_at: "2026-06-06T10:00:00Z",
		updated_at: "2026-06-06T10:00:00Z",
		filed_at: null,
		...overrides,
	};
}

function renderForm(state: SarMatchContext = matchState) {
	return render(
		<MemoryRouter initialEntries={[{ pathname: "/sars/new", state }]}>
			<Routes>
				<Route path="/sars/new" element={<SarFormPage />} />
				<Route path="/sars" element={<div>SAR list page</div>} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("SarFormPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("displays the prefilled subject info from the match context", async () => {
		renderForm();

		await waitFor(() =>
			expect(screen.getByText("Jon Q. Fakename")).toBeInTheDocument(),
		);
		expect(screen.getByText("SANCTIONED PERSON")).toBeInTheDocument();
		expect(screen.getByText("REF-001")).toBeInTheDocument();
	});

	it("submits createSar with the resolved customer_id and filer + narrative", async () => {
		mockClient.createSar.mockResolvedValue(makeSar());
		renderForm();

		await waitFor(() =>
			expect(screen.getByText("Jon Q. Fakename")).toBeInTheDocument(),
		);

		fireEvent.change(screen.getByLabelText(/filer name/i), {
			target: { value: "Alice Compliance" },
		});
		fireEvent.change(screen.getByLabelText(/institution/i), {
			target: { value: "Acme Bank" },
		});
		fireEvent.change(screen.getByLabelText(/contact/i), {
			target: { value: "alice@acme.test" },
		});
		fireEvent.change(screen.getByLabelText(/narrative/i), {
			target: { value: "Customer is a strong match." },
		});

		fireEvent.click(screen.getByRole("button", { name: /file sar/i }));

		await waitFor(() =>
			expect(mockClient.createSar).toHaveBeenCalledWith({
				customer_id: "cust-1",
				match_id: "match-1",
				narrative: "Customer is a strong match.",
				filer: {
					name: "Alice Compliance",
					institution: "Acme Bank",
					contact: "alice@acme.test",
				},
			}),
		);

		await waitFor(() =>
			expect(screen.getByText("SAR list page")).toBeInTheDocument(),
		);
	});

	it("renders an alert when the backend rejects with a 422 STRONG gate error", async () => {
		mockClient.createSar.mockRejectedValue(
			new Error("Match match-1 is not a STRONG match (tier=POSSIBLE)"),
		);
		renderForm();

		await waitFor(() =>
			expect(screen.getByText("Jon Q. Fakename")).toBeInTheDocument(),
		);

		fireEvent.change(screen.getByLabelText(/filer name/i), {
			target: { value: "Alice" },
		});
		fireEvent.change(screen.getByLabelText(/institution/i), {
			target: { value: "Acme Bank" },
		});
		fireEvent.change(screen.getByLabelText(/contact/i), {
			target: { value: "alice@acme.test" },
		});

		fireEvent.click(screen.getByRole("button", { name: /file sar/i }));

		await waitFor(() =>
			expect(screen.getByText(/not a STRONG match/i)).toBeInTheDocument(),
		);
	});

	it("blocks filing when the match has no onboarded customer (null customer_id)", async () => {
		renderForm({ ...matchState, customer_id: null, customer_reference: null });

		await waitFor(() =>
			expect(screen.getByText(/no onboarded customer/i)).toBeInTheDocument(),
		);
		// The submit button is disabled, so a SAR can never be filed.
		expect(screen.getByRole("button", { name: /file sar/i })).toBeDisabled();
		expect(mockClient.createSar).not.toHaveBeenCalled();
	});
});
