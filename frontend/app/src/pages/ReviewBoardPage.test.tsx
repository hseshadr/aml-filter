import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewMatch } from "../lib/api";
import { apiClient } from "../lib/api";
import ReviewBoardPage from "./ReviewBoardPage";

// The page talks to the backend exclusively through the apiClient singleton.
// Mock that seam so the tests drive deterministic responses with no network.
vi.mock("../lib/api", () => ({
	apiClient: {
		listReviewMatches: vi.fn(),
		resolveReviewMatch: vi.fn(),
	},
}));

const mockClient = vi.mocked(apiClient);

// Probe that renders the location state the review board navigates with, so the
// "File SAR" test can assert the match context handed to the SAR form route.
function NavProbe() {
	const location = useLocation();
	return <pre>{JSON.stringify(location.state)}</pre>;
}

function renderBoard() {
	return render(
		<MemoryRouter initialEntries={["/review"]}>
			<Routes>
				<Route path="/review" element={<ReviewBoardPage />} />
				<Route path="/sars/new" element={<NavProbe />} />
			</Routes>
		</MemoryRouter>,
	);
}

function makeMatch(overrides: Partial<ReviewMatch> = {}): ReviewMatch {
	return {
		match_id: "match-1",
		tier: "STRONG",
		match_score: 0.95,
		match_type: "NAME",
		resolution_status: "PENDING",
		reviewer_id: null,
		review_notes: null,
		detected_at: "2026-06-06T10:00:00Z",
		customer_id: "cust-1",
		customer_reference: "REF-001",
		customer_name: "Jon Q. Fakename",
		sanctioned_name: "John Fakename",
		source_list: "OFAC_SDN",
		...overrides,
	};
}

describe("ReviewBoardPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.listReviewMatches.mockResolvedValue([]);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders matches with the correct tier badge variant", async () => {
		mockClient.listReviewMatches.mockResolvedValue([
			makeMatch({
				match_id: "m-strong",
				tier: "STRONG",
				customer_reference: "R-STRONG",
			}),
			makeMatch({
				match_id: "m-possible",
				tier: "POSSIBLE",
				customer_reference: "R-POSSIBLE",
			}),
			makeMatch({
				match_id: "m-weak",
				tier: "WEAK",
				customer_reference: "R-WEAK",
			}),
		]);

		renderBoard();

		await waitFor(() =>
			expect(screen.getByText("R-STRONG")).toBeInTheDocument(),
		);

		const strongRow = screen.getByText("R-STRONG").closest("tr");
		const possibleRow = screen.getByText("R-POSSIBLE").closest("tr");
		const weakRow = screen.getByText("R-WEAK").closest("tr");
		if (!strongRow || !possibleRow || !weakRow)
			throw new Error("rows not found");

		expect(
			within(strongRow).getByText("STRONG", { selector: "span.badge" }),
		).toHaveClass("badge-danger");
		expect(
			within(possibleRow).getByText("POSSIBLE", { selector: "span.badge" }),
		).toHaveClass("badge-warning");
		expect(
			within(weakRow).getByText("WEAK", { selector: "span.badge" }),
		).toHaveClass("badge-muted");
	});

	it("renders the empty state when there are no matches", async () => {
		mockClient.listReviewMatches.mockResolvedValue([]);

		renderBoard();

		await waitFor(() =>
			expect(screen.getByText(/no matches/i)).toBeInTheDocument(),
		);
	});

	it("changing the tier filter calls the client with that tier", async () => {
		renderBoard();
		await waitFor(() =>
			expect(mockClient.listReviewMatches).toHaveBeenCalled(),
		);

		fireEvent.change(screen.getByLabelText(/filter by tier/i), {
			target: { value: "STRONG" },
		});

		await waitFor(() =>
			expect(mockClient.listReviewMatches).toHaveBeenCalledWith(
				expect.objectContaining({ tier: "STRONG" }),
			),
		);
	});

	it("changing the status filter calls the client with that status", async () => {
		renderBoard();
		await waitFor(() =>
			expect(mockClient.listReviewMatches).toHaveBeenCalled(),
		);

		fireEvent.change(screen.getByLabelText(/filter by status/i), {
			target: { value: "TRUE_POSITIVE" },
		});

		await waitFor(() =>
			expect(mockClient.listReviewMatches).toHaveBeenCalledWith(
				expect.objectContaining({ resolution_status: "TRUE_POSITIVE" }),
			),
		);
	});

	it("resolving a pending row PUTs disposition with reviewer and notes and updates the row", async () => {
		mockClient.listReviewMatches.mockResolvedValue([
			makeMatch({ match_id: "m-1", customer_reference: "REF-RES" }),
		]);
		mockClient.resolveReviewMatch.mockResolvedValue(
			makeMatch({
				match_id: "m-1",
				customer_reference: "REF-RES",
				resolution_status: "FALSE_POSITIVE",
				reviewer_id: "alice",
				review_notes: "known good",
			}),
		);

		renderBoard();
		await waitFor(() =>
			expect(screen.getByText("REF-RES")).toBeInTheDocument(),
		);

		const row = screen.getByText("REF-RES").closest("tr");
		if (!row) throw new Error("row not found");

		fireEvent.change(within(row).getByLabelText(/disposition/i), {
			target: { value: "FALSE_POSITIVE" },
		});
		fireEvent.change(within(row).getByLabelText(/reviewer/i), {
			target: { value: "alice" },
		});
		fireEvent.change(within(row).getByLabelText(/notes/i), {
			target: { value: "known good" },
		});
		fireEvent.click(within(row).getByRole("button", { name: /resolve/i }));

		await waitFor(() =>
			expect(mockClient.resolveReviewMatch).toHaveBeenCalledWith(
				"m-1",
				"FALSE_POSITIVE",
				{ reviewer_id: "alice", review_notes: "known good" },
			),
		);

		// The row updates in place: status badge now reflects the resolution.
		await waitFor(() => {
			const updated = screen.getByText("REF-RES").closest("tr");
			if (!updated) throw new Error("row not found");
			expect(
				within(updated).getByText("FALSE_POSITIVE", { selector: "span.badge" }),
			).toBeInTheDocument();
		});
	});

	it("renders an error alert when loading fails", async () => {
		mockClient.listReviewMatches.mockRejectedValue(new Error("boom"));

		renderBoard();

		await waitFor(() => expect(screen.getByText(/boom/i)).toBeInTheDocument());
	});

	it("shows a File SAR action only on STRONG rows", async () => {
		mockClient.listReviewMatches.mockResolvedValue([
			makeMatch({
				match_id: "m-strong",
				tier: "STRONG",
				customer_reference: "R-STRONG",
			}),
			makeMatch({
				match_id: "m-possible",
				tier: "POSSIBLE",
				customer_reference: "R-POSSIBLE",
			}),
		]);

		renderBoard();
		await waitFor(() =>
			expect(screen.getByText("R-STRONG")).toBeInTheDocument(),
		);

		const strongRow = screen.getByText("R-STRONG").closest("tr");
		const possibleRow = screen.getByText("R-POSSIBLE").closest("tr");
		if (!strongRow || !possibleRow) throw new Error("rows not found");

		expect(
			within(strongRow).getByRole("button", { name: /file sar/i }),
		).toBeInTheDocument();
		expect(
			within(possibleRow).queryByRole("button", { name: /file sar/i }),
		).toBeNull();
	});

	it("File SAR navigates to the SAR form with the match context", async () => {
		mockClient.listReviewMatches.mockResolvedValue([
			makeMatch({
				match_id: "m-strong",
				tier: "STRONG",
				customer_id: "cust-strong",
				customer_reference: "R-STRONG",
				customer_name: "Strong Customer",
				sanctioned_name: "BAD ACTOR",
				source_list: "OFAC_SDN",
				match_score: 0.97,
			}),
		]);

		renderBoard();
		await waitFor(() =>
			expect(screen.getByText("R-STRONG")).toBeInTheDocument(),
		);

		const strongRow = screen.getByText("R-STRONG").closest("tr");
		if (!strongRow) throw new Error("row not found");
		fireEvent.click(
			within(strongRow).getByRole("button", { name: /file sar/i }),
		);

		await waitFor(() => {
			const state = JSON.parse(
				screen.getByText(/match_id/).textContent ?? "{}",
			);
			expect(state).toMatchObject({
				match_id: "m-strong",
				customer_id: "cust-strong",
				customer_reference: "R-STRONG",
				customer_name: "Strong Customer",
				sanctioned_name: "BAD ACTOR",
				source_list: "OFAC_SDN",
				match_score: 0.97,
				tier: "STRONG",
			});
		});
	});
});
