import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerOnboardResponse, CustomerResponse } from "../lib/api";
import { apiClient } from "../lib/api";
import CustomersPage from "./CustomersPage";

// The page talks to the backend exclusively through the apiClient singleton.
// Mock that seam so the tests drive deterministic responses with no network.
vi.mock("../lib/api", () => ({
	apiClient: {
		listCustomers: vi.fn(),
		onboardCustomer: vi.fn(),
		updateCustomer: vi.fn(),
		deleteCustomer: vi.fn(),
	},
}));

const mockClient = vi.mocked(apiClient);

function makeCustomer(
	overrides: Partial<CustomerResponse> = {},
): CustomerResponse {
	return {
		customer_id: "cust-1",
		tenant_id: "tenant-1",
		customer_reference: "REF-001",
		onboarding_status: "PENDING_REVIEW",
		kyc_risk_rating: "LOW",
		id_documents: [],
		onboarded_by: "alice",
		screening_entity_id: "ent-1",
		created_at: "2026-06-06T10:00:00Z",
		updated_at: "2026-06-06T10:00:00Z",
		...overrides,
	};
}

function makeOnboardResponse(
	overrides: Partial<CustomerOnboardResponse> = {},
): CustomerOnboardResponse {
	return {
		...makeCustomer(),
		match_entity_ids: [],
		...overrides,
	};
}

describe("CustomersPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.listCustomers.mockResolvedValue([]);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("loads and renders existing customers in a table", async () => {
		mockClient.listCustomers.mockResolvedValue([
			makeCustomer({
				customer_reference: "REF-AAA",
				onboarding_status: "ACTIVE",
				kyc_risk_rating: "MEDIUM",
				onboarded_by: "bob",
			}),
		]);

		render(<CustomersPage />);

		await waitFor(() =>
			expect(screen.getByText("REF-AAA")).toBeInTheDocument(),
		);
		const row = screen.getByText("REF-AAA").closest("tr");
		if (!row) throw new Error("row not found");
		// "ACTIVE"/"MEDIUM" also appear as <option>s — scope to the badge span.
		expect(
			within(row).getByText("ACTIVE", { selector: "span.badge" }),
		).toBeInTheDocument();
		expect(
			within(row).getByText("MEDIUM", { selector: "span.badge" }),
		).toBeInTheDocument();
		expect(within(row).getByText("bob")).toBeInTheDocument();
		expect(mockClient.listCustomers).toHaveBeenCalled();
	});

	it("submitting the form calls onboardCustomer with the entered fields", async () => {
		mockClient.onboardCustomer.mockResolvedValue(makeOnboardResponse());

		render(<CustomersPage />);
		await waitFor(() => expect(mockClient.listCustomers).toHaveBeenCalled());

		fireEvent.change(screen.getByLabelText(/customer reference/i), {
			target: { value: "REF-NEW" },
		});
		fireEvent.change(screen.getByLabelText(/^name/i), {
			target: { value: "Jon Q. Fakename" },
		});
		fireEvent.submit(screen.getByRole("form", { name: /onboard a customer/i }));

		await waitFor(() =>
			expect(mockClient.onboardCustomer).toHaveBeenCalledWith(
				expect.objectContaining({
					customer_reference: "REF-NEW",
					name: "Jon Q. Fakename",
				}),
			),
		);
	});

	it("surfaces a sanctions-match warning when match_entity_ids is non-empty", async () => {
		mockClient.onboardCustomer.mockResolvedValue(
			makeOnboardResponse({ match_entity_ids: ["sdn-123", "sdn-456"] }),
		);

		render(<CustomersPage />);
		await waitFor(() => expect(mockClient.listCustomers).toHaveBeenCalled());

		fireEvent.change(screen.getByLabelText(/customer reference/i), {
			target: { value: "REF-HIT" },
		});
		fireEvent.change(screen.getByLabelText(/^name/i), {
			target: { value: "Sanctioned Person" },
		});
		fireEvent.submit(screen.getByRole("form", { name: /onboard a customer/i }));

		await waitFor(() =>
			expect(
				screen.getByText(/potential sanctions match/i),
			).toBeInTheDocument(),
		);
	});

	it("does not show a sanctions warning on a clean onboarding", async () => {
		mockClient.onboardCustomer.mockResolvedValue(
			makeOnboardResponse({ match_entity_ids: [] }),
		);

		render(<CustomersPage />);
		await waitFor(() => expect(mockClient.listCustomers).toHaveBeenCalled());

		fireEvent.change(screen.getByLabelText(/customer reference/i), {
			target: { value: "REF-CLEAN" },
		});
		fireEvent.change(screen.getByLabelText(/^name/i), {
			target: { value: "Clean Person" },
		});
		fireEvent.submit(screen.getByRole("form", { name: /onboard a customer/i }));

		await waitFor(() => expect(mockClient.onboardCustomer).toHaveBeenCalled());
		expect(screen.queryByText(/potential sanctions match/i)).toBeNull();
	});

	it("renders an error alert when loading customers fails", async () => {
		mockClient.listCustomers.mockRejectedValue(new Error("boom"));

		render(<CustomersPage />);

		await waitFor(() => expect(screen.getByText(/boom/i)).toBeInTheDocument());
	});

	it("a row status change calls updateCustomer with the new status", async () => {
		mockClient.listCustomers.mockResolvedValue([
			makeCustomer({ customer_id: "cust-row", onboarding_status: "DRAFT" }),
		]);
		mockClient.updateCustomer.mockResolvedValue(
			makeCustomer({ customer_id: "cust-row", onboarding_status: "ACTIVE" }),
		);

		render(<CustomersPage />);
		await waitFor(() =>
			expect(screen.getByText("REF-001")).toBeInTheDocument(),
		);

		const row = screen.getByText("REF-001").closest("tr");
		if (!row) throw new Error("row not found");
		const statusSelect = within(row).getByLabelText(/status for/i);
		fireEvent.change(statusSelect, { target: { value: "ACTIVE" } });

		await waitFor(() =>
			expect(mockClient.updateCustomer).toHaveBeenCalledWith("cust-row", {
				onboarding_status: "ACTIVE",
			}),
		);
	});

	it("deleting a row calls deleteCustomer after confirmation", async () => {
		mockClient.listCustomers.mockResolvedValue([
			makeCustomer({ customer_id: "cust-del" }),
		]);
		mockClient.deleteCustomer.mockResolvedValue(undefined);
		vi.spyOn(window, "confirm").mockReturnValue(true);

		render(<CustomersPage />);
		await waitFor(() =>
			expect(screen.getByText("REF-001")).toBeInTheDocument(),
		);

		const row = screen.getByText("REF-001").closest("tr");
		if (!row) throw new Error("row not found");
		fireEvent.click(within(row).getByRole("button", { name: /delete/i }));

		await waitFor(() =>
			expect(mockClient.deleteCustomer).toHaveBeenCalledWith("cust-del"),
		);
	});
});
