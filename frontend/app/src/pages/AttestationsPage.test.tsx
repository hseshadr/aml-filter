import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttestationRecord, AttestationStatus } from "../lib/api";
import { apiClient } from "../lib/api";
import AttestationsPage from "./AttestationsPage";

// The page talks to the backend exclusively through the apiClient singleton.
// Mock that seam so the tests drive deterministic responses with no network.
vi.mock("../lib/api", () => ({
	apiClient: {
		listAttestations: vi.fn(),
		generateAttestation: vi.fn(),
		verifyAttestation: vi.fn(),
		exportAttestation: vi.fn(),
	},
}));

const mockClient = vi.mocked(apiClient);

const FUTURE = "2999-01-01T00:00:00Z";
const PAST = "2000-01-01T00:00:00Z";

function makeAttestation(
	overrides: Partial<AttestationRecord> = {},
): AttestationRecord {
	return {
		attestation_id: "att-1",
		tenant_id: "tenant-1",
		customer_id: "cust-1",
		customer_reference: "REF-001",
		screened_at: "2026-06-06T10:00:00Z",
		valid_until: FUTURE,
		lists_and_versions: [{ list_id: "OFAC_SDN", version: "2026-06-01" }],
		result: { status: "CLEAR", match_count: 0, pending_count: 0 },
		signature: "abc123",
		signing_key_id: "key-1",
		algo: "ed25519",
		created_at: "2026-06-06T10:00:00Z",
		...overrides,
	};
}

describe("AttestationsPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.listAttestations.mockResolvedValue([]);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function rowFor(reference: string): HTMLElement {
		const row = screen.getByText(reference).closest("tr");
		if (!row) throw new Error(`row for ${reference} not found`);
		return row;
	}

	it("renders a status badge per attestation status variant", async () => {
		const cases: { status: AttestationStatus; cls: string; ref: string }[] = [
			{ status: "CLEAR", cls: "badge-success", ref: "REF-CLEAR" },
			{ status: "MATCHES_PENDING", cls: "badge-warning", ref: "REF-PEND" },
			{
				status: "MATCHES_DISPOSITIONED",
				cls: "badge-secondary",
				ref: "REF-DISP",
			},
		];
		mockClient.listAttestations.mockResolvedValue(
			cases.map((c, i) =>
				makeAttestation({
					attestation_id: `a-${i}`,
					customer_id: `c-${i}`,
					customer_reference: c.ref,
					result: { status: c.status, match_count: 0, pending_count: 0 },
				}),
			),
		);

		render(<AttestationsPage />);

		await waitFor(() =>
			expect(screen.getByText("REF-CLEAR")).toBeInTheDocument(),
		);
		for (const c of cases) {
			const badge = within(rowFor(c.ref)).getByText(c.status, {
				selector: "span.badge",
			});
			expect(badge).toHaveClass(c.cls);
		}
	});

	it("flags a stale customer when valid_until is in the past", async () => {
		mockClient.listAttestations.mockResolvedValue([
			makeAttestation({ customer_reference: "REF-STALE", valid_until: PAST }),
		]);

		render(<AttestationsPage />);

		await waitFor(() =>
			expect(screen.getByText("REF-STALE")).toBeInTheDocument(),
		);
		expect(
			within(rowFor("REF-STALE")).getByText(/due for re-review/i),
		).toBeInTheDocument();
	});

	it("does not flag a customer whose attestation is still valid", async () => {
		mockClient.listAttestations.mockResolvedValue([
			makeAttestation({ customer_reference: "REF-FRESH", valid_until: FUTURE }),
		]);

		render(<AttestationsPage />);

		await waitFor(() =>
			expect(screen.getByText("REF-FRESH")).toBeInTheDocument(),
		);
		expect(
			within(rowFor("REF-FRESH")).queryByText(/due for re-review/i),
		).toBeNull();
	});

	it("shows a signed indicator when the attestation carries a signature", async () => {
		mockClient.listAttestations.mockResolvedValue([
			makeAttestation({ customer_reference: "REF-SIGNED", signature: "sig" }),
		]);

		render(<AttestationsPage />);

		await waitFor(() =>
			expect(screen.getByText("REF-SIGNED")).toBeInTheDocument(),
		);
		expect(
			within(rowFor("REF-SIGNED")).getByText("Signed", {
				selector: "span.badge",
			}),
		).toBeInTheDocument();
	});

	it("shows an unsigned indicator when there is no signature", async () => {
		mockClient.listAttestations.mockResolvedValue([
			makeAttestation({ customer_reference: "REF-UNSIGNED", signature: null }),
		]);

		render(<AttestationsPage />);

		await waitFor(() =>
			expect(screen.getByText("REF-UNSIGNED")).toBeInTheDocument(),
		);
		expect(
			within(rowFor("REF-UNSIGNED")).getByText("Unsigned", {
				selector: "span.badge",
			}),
		).toBeInTheDocument();
	});

	it("generates an attestation via generateAttestation from the form", async () => {
		mockClient.generateAttestation.mockResolvedValue(makeAttestation());

		render(<AttestationsPage />);
		await waitFor(() => expect(mockClient.listAttestations).toHaveBeenCalled());

		fireEvent.change(screen.getByLabelText(/customer id/i), {
			target: { value: "cust-9" },
		});
		fireEvent.submit(
			screen.getByRole("form", { name: /generate attestation/i }),
		);

		await waitFor(() =>
			expect(mockClient.generateAttestation).toHaveBeenCalledWith({
				customer_id: "cust-9",
				require_signature: false,
			}),
		);
	});

	it("verifies an attestation and shows a valid result", async () => {
		mockClient.listAttestations.mockResolvedValue([
			makeAttestation({ attestation_id: "a-ok", customer_reference: "REF-OK" }),
		]);
		mockClient.verifyAttestation.mockResolvedValue({
			valid: true,
			reason: "signature ok",
		});

		render(<AttestationsPage />);
		await waitFor(() => expect(screen.getByText("REF-OK")).toBeInTheDocument());

		fireEvent.click(
			within(rowFor("REF-OK")).getByRole("button", { name: /verify/i }),
		);

		await waitFor(() =>
			expect(mockClient.verifyAttestation).toHaveBeenCalledWith("a-ok"),
		);
		expect(
			await screen.findByText("Valid", { selector: "span.badge" }),
		).toBeInTheDocument();
		expect(screen.getByText(/signature ok/i)).toBeInTheDocument();
	});

	it("verifies an attestation and shows an invalid result with reason", async () => {
		mockClient.listAttestations.mockResolvedValue([
			makeAttestation({
				attestation_id: "a-bad",
				customer_reference: "REF-BAD",
			}),
		]);
		mockClient.verifyAttestation.mockResolvedValue({
			valid: false,
			reason: "signature mismatch",
		});

		render(<AttestationsPage />);
		await waitFor(() =>
			expect(screen.getByText("REF-BAD")).toBeInTheDocument(),
		);

		fireEvent.click(
			within(rowFor("REF-BAD")).getByRole("button", { name: /verify/i }),
		);

		await waitFor(() =>
			expect(mockClient.verifyAttestation).toHaveBeenCalledWith("a-bad"),
		);
		expect(
			await screen.findByText("Invalid", { selector: "span.badge" }),
		).toBeInTheDocument();
		expect(screen.getByText(/signature mismatch/i)).toBeInTheDocument();
	});

	it("exports a PDF badge with the pdf format", async () => {
		mockClient.listAttestations.mockResolvedValue([
			makeAttestation({ attestation_id: "a-1", customer_reference: "REF-PDF" }),
		]);
		mockClient.exportAttestation.mockResolvedValue(undefined);

		render(<AttestationsPage />);
		await waitFor(() =>
			expect(screen.getByText("REF-PDF")).toBeInTheDocument(),
		);

		fireEvent.click(
			within(rowFor("REF-PDF")).getByRole("button", { name: /pdf/i }),
		);

		await waitFor(() =>
			expect(mockClient.exportAttestation).toHaveBeenCalledWith("a-1", "pdf"),
		);
	});

	it("exports a JSON badge with the json format", async () => {
		mockClient.listAttestations.mockResolvedValue([
			makeAttestation({
				attestation_id: "a-2",
				customer_reference: "REF-JSON",
			}),
		]);
		mockClient.exportAttestation.mockResolvedValue(undefined);

		render(<AttestationsPage />);
		await waitFor(() =>
			expect(screen.getByText("REF-JSON")).toBeInTheDocument(),
		);

		fireEvent.click(
			within(rowFor("REF-JSON")).getByRole("button", { name: /json/i }),
		);

		await waitFor(() =>
			expect(mockClient.exportAttestation).toHaveBeenCalledWith("a-2", "json"),
		);
	});

	it("passes stale=true when the due-for-review filter is enabled", async () => {
		render(<AttestationsPage />);
		await waitFor(() =>
			expect(mockClient.listAttestations).toHaveBeenCalledWith({}),
		);

		fireEvent.click(screen.getByLabelText(/due for re-review only/i));

		await waitFor(() =>
			expect(mockClient.listAttestations).toHaveBeenCalledWith({ stale: true }),
		);
	});

	it("renders an error alert when loading fails", async () => {
		mockClient.listAttestations.mockRejectedValue(new Error("boom"));

		render(<AttestationsPage />);

		await waitFor(() => expect(screen.getByText(/boom/i)).toBeInTheDocument());
	});
});
