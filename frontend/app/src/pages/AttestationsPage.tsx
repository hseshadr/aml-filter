/** Screening attestation / review-badge list (the /v1/attestations tier).
 *
 * Shows the latest attestation per customer: its result status, validity,
 * whether it is signed, and whether the customer is due for re-review (stale).
 * Operators can generate/refresh a badge, verify its signature, and download
 * the badge artifact (PDF or JSON).
 */

import { useCallback, useEffect, useState } from "react";
import {
	type AttestationExportFormat,
	type AttestationRecord,
	type AttestationStatus,
	type AttestationVerification,
	apiClient,
} from "../lib/api";

function statusBadgeClass(status: AttestationStatus): string {
	if (status === "CLEAR") return "badge badge-success";
	if (status === "MATCHES_PENDING") return "badge badge-warning";
	return "badge badge-secondary";
}

/** An attestation is stale (due for re-review) when its validity has lapsed. */
function isStale(record: AttestationRecord): boolean {
	if (!record.valid_until) return true;
	return new Date(record.valid_until).getTime() <= Date.now();
}

function errorMessage(err: unknown, fallback: string): string {
	return err instanceof Error ? err.message : fallback;
}

interface VerifyState {
	attestationId: string;
	result: AttestationVerification;
}

export default function AttestationsPage() {
	const [attestations, setAttestations] = useState<AttestationRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [staleOnly, setStaleOnly] = useState(false);
	const [customerId, setCustomerId] = useState("");
	const [verify, setVerify] = useState<VerifyState | null>(null);

	const loadAttestations = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const data = await apiClient.listAttestations(
				staleOnly ? { stale: true } : {},
			);
			setAttestations(data);
		} catch (err) {
			setError(errorMessage(err, "Failed to load attestations"));
		} finally {
			setLoading(false);
		}
	}, [staleOnly]);

	useEffect(() => {
		loadAttestations();
	}, [loadAttestations]);

	const handleGenerate = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			setError(null);
			await apiClient.generateAttestation({
				customer_id: customerId.trim(),
				require_signature: false,
			});
			setCustomerId("");
			await loadAttestations();
		} catch (err) {
			setError(errorMessage(err, "Failed to generate attestation"));
		}
	};

	const handleVerify = async (attestationId: string) => {
		try {
			setError(null);
			const result = await apiClient.verifyAttestation(attestationId);
			setVerify({ attestationId, result });
		} catch (err) {
			setError(errorMessage(err, "Failed to verify attestation"));
		}
	};

	const handleExport = async (
		attestationId: string,
		format: AttestationExportFormat,
	) => {
		try {
			setError(null);
			await apiClient.exportAttestation(attestationId, format);
		} catch (err) {
			setError(errorMessage(err, "Failed to export attestation"));
		}
	};

	return (
		<div>
			<h1>Screening Attestations</h1>
			<p className="text-muted">
				Verifiable review badges — each customer's latest screening result, its
				validity window, and whether they are due for re-review.
			</p>

			{error && <div className="alert alert-error">Error: {error}</div>}

			<GenerateBadgeForm
				customerId={customerId}
				onCustomerIdChange={setCustomerId}
				onSubmit={handleGenerate}
			/>

			<div className="flex-between mb-md">
				<h2>Attestations ({attestations.length})</h2>
				<label className="flex-gap-sm">
					<input
						type="checkbox"
						checked={staleOnly}
						onChange={(e) => setStaleOnly(e.target.checked)}
					/>
					Due for re-review only
				</label>
			</div>

			{loading ? (
				<p>Loading...</p>
			) : attestations.length === 0 ? (
				<p>No attestations yet. Generate one for a customer to get started.</p>
			) : (
				<AttestationTable
					attestations={attestations}
					verify={verify}
					onVerify={handleVerify}
					onExport={handleExport}
				/>
			)}
		</div>
	);
}

interface GenerateBadgeFormProps {
	customerId: string;
	onCustomerIdChange: (value: string) => void;
	onSubmit: (e: React.FormEvent) => void;
}

function GenerateBadgeForm({
	customerId,
	onCustomerIdChange,
	onSubmit,
}: GenerateBadgeFormProps) {
	return (
		<form
			aria-label="Generate attestation"
			onSubmit={onSubmit}
			className="card card-muted mb-lg"
		>
			<h3>Generate / Refresh Badge</h3>
			<div className="flex-gap-sm">
				<div className="form-group">
					<label htmlFor="attestation-customer-id" className="form-label">
						Customer ID
					</label>
					<input
						id="attestation-customer-id"
						value={customerId}
						onChange={(e) => onCustomerIdChange(e.target.value)}
						className="form-input"
						placeholder="cust-…"
					/>
				</div>
				<button
					type="submit"
					className="btn btn-primary"
					disabled={!customerId.trim()}
				>
					Generate
				</button>
			</div>
		</form>
	);
}

interface AttestationTableProps {
	attestations: AttestationRecord[];
	verify: VerifyState | null;
	onVerify: (attestationId: string) => void;
	onExport: (attestationId: string, format: AttestationExportFormat) => void;
}

function AttestationTable({
	attestations,
	verify,
	onVerify,
	onExport,
}: AttestationTableProps) {
	return (
		<table className="table">
			<thead>
				<tr>
					<th>Customer</th>
					<th>Status</th>
					<th>Valid Until</th>
					<th>Signature</th>
					<th className="table-cell-right">Actions</th>
				</tr>
			</thead>
			<tbody>
				{attestations.map((att) => (
					<AttestationRow
						key={att.attestation_id}
						attestation={att}
						verify={
							verify?.attestationId === att.attestation_id
								? verify.result
								: null
						}
						onVerify={onVerify}
						onExport={onExport}
					/>
				))}
			</tbody>
		</table>
	);
}

interface AttestationRowProps {
	attestation: AttestationRecord;
	verify: AttestationVerification | null;
	onVerify: (attestationId: string) => void;
	onExport: (attestationId: string, format: AttestationExportFormat) => void;
}

function AttestationRow({
	attestation,
	verify,
	onVerify,
	onExport,
}: AttestationRowProps) {
	const stale = isStale(attestation);
	const id = attestation.attestation_id;
	return (
		<tr>
			<td>{attestation.customer_reference}</td>
			<td>
				<span className={statusBadgeClass(attestation.result.status)}>
					{attestation.result.status}
				</span>
			</td>
			<td>
				{attestation.valid_until
					? new Date(attestation.valid_until).toLocaleDateString()
					: "—"}
				{stale && (
					<div>
						<span className="badge badge-danger">Due for re-review</span>
					</div>
				)}
			</td>
			<td>
				{attestation.signature ? (
					<span className="badge badge-success">Signed</span>
				) : (
					<span className="badge badge-secondary">Unsigned</span>
				)}
				{verify && (
					<div className="text-sm">
						<span
							className={
								verify.valid ? "badge badge-success" : "badge badge-danger"
							}
						>
							{verify.valid ? "Valid" : "Invalid"}
						</span>{" "}
						<span className="text-muted">{verify.reason}</span>
					</div>
				)}
			</td>
			<td className="table-cell-right">
				<div className="flex-gap-sm">
					<button
						type="button"
						onClick={() => onVerify(id)}
						className="btn btn-secondary btn-sm"
					>
						Verify
					</button>
					<button
						type="button"
						onClick={() => onExport(id, "pdf")}
						className="btn btn-secondary btn-sm"
					>
						PDF
					</button>
					<button
						type="button"
						onClick={() => onExport(id, "json")}
						className="btn btn-secondary btn-sm"
					>
						JSON
					</button>
				</div>
			</td>
		</tr>
	);
}
