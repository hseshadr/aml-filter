/** KYC customer onboarding page (the /v1/customers tier). */

import { useCallback, useEffect, useState } from "react";
import {
	apiClient,
	type CustomerOnboardResponse,
	type CustomerResponse,
	type IdDocument,
	type KycRiskRating,
	type OnboardingStatus,
} from "../lib/api";
import { runWatchlistSync, syncSummaryText } from "../lib/sync";
import { workstation } from "../lib/workstation";

const ONBOARDING_STATUSES: OnboardingStatus[] = [
	"DRAFT",
	"PENDING_REVIEW",
	"ACTIVE",
	"REJECTED",
];

const RISK_RATINGS: KycRiskRating[] = ["LOW", "MEDIUM", "HIGH"];

interface IdDocumentRow {
	doc_type: string;
	number: string;
	issuing_country: string;
	expiry: string;
}

interface NewCustomerForm {
	customer_reference: string;
	name: string;
	onboarded_by: string;
	country: string;
}

/** Inline edit buffer for a single customer row (name / country). */
interface EditState {
	customerId: string;
	name: string;
	country: string;
}

const EMPTY_FORM: NewCustomerForm = {
	customer_reference: "",
	name: "",
	onboarded_by: "",
	country: "",
};

function statusBadgeClass(status: string): string {
	if (status === "ACTIVE") return "badge badge-success";
	if (status === "REJECTED") return "badge badge-danger";
	if (status === "PENDING_REVIEW") return "badge badge-warning";
	return "badge badge-muted";
}

function riskBadgeClass(rating: string | null): string {
	if (rating === "HIGH") return "badge badge-danger";
	if (rating === "MEDIUM") return "badge badge-warning";
	if (rating === "LOW") return "badge badge-success";
	return "badge badge-muted";
}

function toIdDocuments(rows: IdDocumentRow[]): IdDocument[] {
	return rows
		.filter((row) => row.doc_type.trim() && row.number.trim())
		.map((row) => ({
			doc_type: row.doc_type.trim(),
			number: row.number.trim(),
			issuing_country: row.issuing_country.trim().toUpperCase(),
			expiry: row.expiry || null,
		}));
}

function errorMessage(err: unknown, fallback: string): string {
	return err instanceof Error ? err.message : fallback;
}

export default function CustomersPage() {
	const [customers, setCustomers] = useState<CustomerResponse[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [form, setForm] = useState<NewCustomerForm>(EMPTY_FORM);
	const [idDocs, setIdDocs] = useState<IdDocumentRow[]>([]);
	const [lastResult, setLastResult] = useState<CustomerOnboardResponse | null>(
		null,
	);
	const [syncing, setSyncing] = useState(false);
	const [syncMessage, setSyncMessage] = useState<string | null>(null);
	const [lastSynced, setLastSynced] = useState<{
		version: string;
		at: string;
	} | null>(null);
	const [editing, setEditing] = useState<EditState | null>(null);

	const loadCustomers = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const data = await apiClient.listCustomers();
			setCustomers(data);
		} catch (err) {
			setError(errorMessage(err, "Failed to load customers"));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadCustomers();
	}, [loadCustomers]);

	const handleOnboard = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			setError(null);
			const result = await apiClient.onboardCustomer({
				customer_reference: form.customer_reference,
				name: form.name,
				onboarded_by: form.onboarded_by || undefined,
				country: form.country || undefined,
				id_documents: toIdDocuments(idDocs),
			});
			setLastResult(result);
			setForm(EMPTY_FORM);
			setIdDocs([]);
			await loadCustomers();
		} catch (err) {
			setError(errorMessage(err, "Failed to onboard customer"));
		}
	};

	const handleStatusChange = async (
		customerId: string,
		onboarding_status: OnboardingStatus,
	) => {
		try {
			setError(null);
			await apiClient.updateCustomer(customerId, { onboarding_status });
			await loadCustomers();
		} catch (err) {
			setError(errorMessage(err, "Failed to update status"));
		}
	};

	const handleRiskChange = async (
		customerId: string,
		kyc_risk_rating: KycRiskRating,
	) => {
		try {
			setError(null);
			await apiClient.updateCustomer(customerId, { kyc_risk_rating });
			await loadCustomers();
		} catch (err) {
			setError(errorMessage(err, "Failed to update risk rating"));
		}
	};

	const handleDelete = async (customerId: string) => {
		if (!confirm("Delete this customer? This cannot be undone.")) return;
		try {
			setError(null);
			await apiClient.deleteCustomer(customerId);
			await loadCustomers();
		} catch (err) {
			setError(errorMessage(err, "Failed to delete customer"));
		}
	};

	const handleCheckForUpdates = async () => {
		try {
			setSyncing(true);
			setError(null);
			const handle = await workstation();
			// A fresh manual click may precede the background engine boot — the
			// watchlist version is only known after bootstrap, so ensure it first.
			if (handle.watchlistVersion() === null) {
				await handle.engineBoot();
			}
			const result = await runWatchlistSync(handle);
			if (result === null) {
				setSyncMessage(
					"Screening engine is still starting — try again shortly.",
				);
				return;
			}
			setSyncMessage(syncSummaryText(result));
			setLastSynced({ version: result.version, at: new Date().toISOString() });
			await loadCustomers();
		} catch (err) {
			setError(errorMessage(err, "Failed to check for updates"));
		} finally {
			setSyncing(false);
		}
	};

	const handleEditSave = async () => {
		if (editing === null) return;
		try {
			setError(null);
			// Persist name/country, then re-screen this customer against the
			// current watchlist so the review board reflects the new identity.
			await apiClient.updateCustomer(editing.customerId, {
				name: editing.name,
				country: editing.country,
			});
			const handle = await workstation();
			await handle.rescan.screenCustomer(editing.customerId);
			setEditing(null);
			await loadCustomers();
		} catch (err) {
			setError(errorMessage(err, "Failed to save customer"));
		}
	};

	const addIdDocRow = () =>
		setIdDocs((rows) => [
			...rows,
			{ doc_type: "", number: "", issuing_country: "", expiry: "" },
		]);

	const updateIdDocRow = (
		index: number,
		field: keyof IdDocumentRow,
		value: string,
	) =>
		setIdDocs((rows) =>
			rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
		);

	const removeIdDocRow = (index: number) =>
		setIdDocs((rows) => rows.filter((_, i) => i !== index));

	return (
		<div>
			<div className="flex-between">
				<h1>KYC Customer Onboarding</h1>
				<button
					type="button"
					onClick={handleCheckForUpdates}
					disabled={syncing}
					className="btn btn-secondary btn-sm"
				>
					{syncing ? "Checking…" : "Check for updates"}
				</button>
			</div>

			{syncMessage && (
				<div className="alert card-muted text-sm" role="status">
					{syncMessage}
				</div>
			)}
			{lastSynced && (
				<p className="text-muted text-sm">
					Last synced: {lastSynced.version} ·{" "}
					{new Date(lastSynced.at).toLocaleTimeString()}
				</p>
			)}

			{error && <div className="alert alert-error">Error: {error}</div>}

			{lastResult && (
				<OnboardResultAlert
					result={lastResult}
					onDismiss={() => setLastResult(null)}
				/>
			)}

			<form
				onSubmit={handleOnboard}
				aria-label="Onboard a customer"
				className="card card-muted mb-lg"
			>
				<h3>Onboard a Customer</h3>
				<div className="form-group form-grid">
					<div>
						<label htmlFor="customer-reference" className="form-label">
							Customer Reference *
						</label>
						<input
							id="customer-reference"
							type="text"
							value={form.customer_reference}
							onChange={(e) =>
								setForm({ ...form, customer_reference: e.target.value })
							}
							required
							className="form-input"
						/>
					</div>
					<div>
						<label htmlFor="customer-name" className="form-label">
							Name *
						</label>
						<input
							id="customer-name"
							type="text"
							value={form.name}
							onChange={(e) => setForm({ ...form, name: e.target.value })}
							required
							className="form-input"
						/>
					</div>
				</div>
				<div className="form-group form-grid">
					<div>
						<label htmlFor="customer-onboarded-by" className="form-label">
							Onboarded By
						</label>
						<input
							id="customer-onboarded-by"
							type="text"
							value={form.onboarded_by}
							onChange={(e) =>
								setForm({ ...form, onboarded_by: e.target.value })
							}
							className="form-input"
						/>
					</div>
					<div>
						<label htmlFor="customer-country" className="form-label">
							Country Code
						</label>
						<input
							id="customer-country"
							type="text"
							value={form.country}
							onChange={(e) => setForm({ ...form, country: e.target.value })}
							maxLength={2}
							className="form-input"
						/>
					</div>
				</div>

				<div className="form-group">
					<div className="flex-between mb-sm">
						<span className="form-label-bold">Identity Documents</span>
						<button
							type="button"
							onClick={addIdDocRow}
							className="btn btn-secondary btn-sm"
						>
							+ Add Document
						</button>
					</div>
					{idDocs.length === 0 ? (
						<p className="text-muted text-sm">No documents added.</p>
					) : (
						idDocs.map((row, index) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: rows are positional with no stable id
								key={index}
								className="form-grid mb-sm"
								data-testid="id-doc-row"
							>
								<input
									type="text"
									aria-label={`Document type ${index + 1}`}
									placeholder="Type (e.g. PASSPORT)"
									value={row.doc_type}
									onChange={(e) =>
										updateIdDocRow(index, "doc_type", e.target.value)
									}
									className="form-input"
								/>
								<input
									type="text"
									aria-label={`Document number ${index + 1}`}
									placeholder="Number"
									value={row.number}
									onChange={(e) =>
										updateIdDocRow(index, "number", e.target.value)
									}
									className="form-input"
								/>
								<input
									type="text"
									aria-label={`Issuing country ${index + 1}`}
									placeholder="ISO2"
									maxLength={2}
									value={row.issuing_country}
									onChange={(e) =>
										updateIdDocRow(index, "issuing_country", e.target.value)
									}
									className="form-input"
								/>
								<input
									type="date"
									aria-label={`Expiry ${index + 1}`}
									value={row.expiry}
									onChange={(e) =>
										updateIdDocRow(index, "expiry", e.target.value)
									}
									className="form-input"
								/>
								<button
									type="button"
									onClick={() => removeIdDocRow(index)}
									className="btn btn-danger btn-sm"
								>
									Remove
								</button>
							</div>
						))
					)}
				</div>

				<button type="submit" className="btn btn-primary">
					Onboard
				</button>
			</form>

			<h2>Customers ({customers.length})</h2>
			{loading ? (
				<p>Loading...</p>
			) : customers.length === 0 ? (
				<p>No customers onboarded yet. Onboard one to get started.</p>
			) : (
				<table className="table">
					<thead>
						<tr>
							<th>Reference</th>
							<th>Status</th>
							<th>Risk</th>
							<th>Onboarded By</th>
							<th>Created</th>
							<th className="table-cell-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{customers.map((customer) => (
							<tr key={customer.customer_id}>
								<td>{customer.customer_reference}</td>
								<td>
									<span
										className={statusBadgeClass(customer.onboarding_status)}
									>
										{customer.onboarding_status}
									</span>
								</td>
								<td>
									<span className={riskBadgeClass(customer.kyc_risk_rating)}>
										{customer.kyc_risk_rating ?? "UNRATED"}
									</span>
								</td>
								<td>{customer.onboarded_by}</td>
								<td>{new Date(customer.created_at).toLocaleDateString()}</td>
								<td className="table-cell-right">
									<div className="flex-gap-sm">
										<select
											aria-label={`Status for ${customer.customer_reference}`}
											value={customer.onboarding_status}
											onChange={(e) =>
												handleStatusChange(
													customer.customer_id,
													e.target.value as OnboardingStatus,
												)
											}
											className="form-select"
										>
											{ONBOARDING_STATUSES.map((s) => (
												<option key={s} value={s}>
													{s}
												</option>
											))}
										</select>
										<select
											aria-label={`Risk for ${customer.customer_reference}`}
											value={customer.kyc_risk_rating ?? ""}
											onChange={(e) =>
												handleRiskChange(
													customer.customer_id,
													e.target.value as KycRiskRating,
												)
											}
											className="form-select"
										>
											<option value="" disabled>
												Risk…
											</option>
											{RISK_RATINGS.map((r) => (
												<option key={r} value={r}>
													{r}
												</option>
											))}
										</select>
										{editing?.customerId === customer.customer_id ? (
											<>
												<input
													type="text"
													aria-label={`Edit name for ${customer.customer_reference}`}
													value={editing.name}
													onChange={(e) =>
														setEditing({ ...editing, name: e.target.value })
													}
													className="form-input"
												/>
												<input
													type="text"
													aria-label={`Edit country for ${customer.customer_reference}`}
													value={editing.country}
													maxLength={2}
													onChange={(e) =>
														setEditing({ ...editing, country: e.target.value })
													}
													className="form-input"
												/>
												<button
													type="button"
													onClick={handleEditSave}
													className="btn btn-primary btn-sm"
												>
													Save
												</button>
												<button
													type="button"
													onClick={() => setEditing(null)}
													className="btn btn-secondary btn-sm"
												>
													Cancel
												</button>
											</>
										) : (
											<button
												type="button"
												aria-label={`Edit ${customer.customer_reference}`}
												onClick={() =>
													setEditing({
														customerId: customer.customer_id,
														name: "",
														country: "",
													})
												}
												className="btn btn-secondary btn-sm"
											>
												Edit
											</button>
										)}
										<button
											type="button"
											onClick={() => handleDelete(customer.customer_id)}
											className="btn btn-danger btn-sm"
										>
											Delete
										</button>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

interface OnboardResultAlertProps {
	result: CustomerOnboardResponse;
	onDismiss: () => void;
}

function OnboardResultAlert({ result, onDismiss }: OnboardResultAlertProps) {
	const hasMatch = result.match_entity_ids.length > 0;
	return (
		<div className={`alert ${hasMatch ? "alert-warning" : "alert-success"}`}>
			<div className="flex-between">
				<span>
					{hasMatch ? (
						<>
							⚠ Onboarded <strong>{result.customer_reference}</strong> —
							potential sanctions match ({result.match_entity_ids.length});
							needs review.
						</>
					) : (
						<>
							✓ Onboarded <strong>{result.customer_reference}</strong> — no
							sanctions matches.
						</>
					)}
				</span>
				<button
					type="button"
					onClick={onDismiss}
					className="btn btn-secondary btn-sm"
				>
					Dismiss
				</button>
			</div>
		</div>
	);
}
