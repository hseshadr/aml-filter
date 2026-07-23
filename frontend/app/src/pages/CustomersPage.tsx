/** KYC customer onboarding page (the /v1/customers tier). */

import type { TFunction } from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
	apiClient,
	type CustomerOnboardResponse,
	type CustomerResponse,
	type IdDocument,
	type KycRiskRating,
	type OnboardingStatus,
} from "../lib/api";
import {
	buildCustomerImportPreview,
	type CustomerImportDuplicate,
	type CustomerImportError,
	type CustomerImportRow,
	createCustomerExportFile,
	readCustomerImportFile,
} from "../lib/customerTransfer";
import { checkForWatchlistUpdates, syncSummaryText } from "../lib/sync";
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
	dob: string;
}

/** Inline edit buffer for a single customer row (name / country). */
interface EditState {
	customerId: string;
	name: string;
	country: string;
}

interface ImportPreviewState {
	fileName: string;
	accepted: ReadonlyArray<CustomerImportRow>;
	duplicates: ReadonlyArray<CustomerImportDuplicate>;
	errors: ReadonlyArray<CustomerImportError>;
}

const EMPTY_FORM: NewCustomerForm = {
	customer_reference: "",
	name: "",
	onboarded_by: "",
	country: "",
	dob: "",
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
	const { t } = useTranslation("customers");
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
	const [importPreview, setImportPreview] = useState<ImportPreviewState | null>(
		null,
	);
	const [importing, setImporting] = useState(false);
	const [transferMessage, setTransferMessage] = useState<string | null>(null);
	const importInputRef = useRef<HTMLInputElement>(null);

	const loadCustomers = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const data = await apiClient.listCustomers();
			setCustomers(data);
		} catch (err) {
			setError(errorMessage(err, t("errors.load")));
		} finally {
			setLoading(false);
		}
	}, [t]);

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
				...(form.onboarded_by ? { onboarded_by: form.onboarded_by } : {}),
				...(form.country ? { country: form.country } : {}),
				...(form.dob ? { dob: form.dob } : {}),
				id_documents: toIdDocuments(idDocs),
			});
			setLastResult(result);
			setForm(EMPTY_FORM);
			setIdDocs([]);
			await loadCustomers();
		} catch (err) {
			setError(errorMessage(err, t("errors.onboard")));
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
			setError(errorMessage(err, t("errors.updateStatus")));
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
			setError(errorMessage(err, t("errors.updateRisk")));
		}
	};

	const handleDelete = async (customerId: string) => {
		if (!confirm(t("actions.deleteConfirm"))) return;
		try {
			setError(null);
			await apiClient.deleteCustomer(customerId);
			await loadCustomers();
		} catch (err) {
			setError(errorMessage(err, t("errors.delete")));
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
			// Live new-publish detection: poll the signed manifest, and if a newer
			// list was published after this tab booted, reload it into the engine
			// before re-screening every customer against it.
			const result = await checkForWatchlistUpdates(handle);
			if (result === null) {
				setSyncMessage(t("sync.enginePending"));
				return;
			}
			setSyncMessage(syncSummaryText(result));
			setLastSynced({ version: result.version, at: new Date().toISOString() });
			await loadCustomers();
		} catch (err) {
			setError(errorMessage(err, t("errors.checkUpdates")));
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
			setError(errorMessage(err, t("errors.save")));
		}
	};

	const handleExport = async () => {
		try {
			setError(null);
			setTransferMessage(null);
			const file = await createCustomerExportFile(customers);
			const url = URL.createObjectURL(file);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = `aml-filter-customers-${new Date().toISOString().slice(0, 10)}.xlsx`;
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			window.setTimeout(() => URL.revokeObjectURL(url), 0);
			setTransferMessage(t("transfer.exported", { total: customers.length }));
		} catch (err) {
			setError(errorMessage(err, t("errors.export")));
		}
	};

	const handleImportFile = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		try {
			setError(null);
			setTransferMessage(null);
			const parsed = await readCustomerImportFile(file);
			const preview = buildCustomerImportPreview(
				parsed.rows,
				customers.map((customer) => customer.customer_reference),
			);
			setImportPreview({
				fileName: file.name,
				accepted: preview.accepted,
				duplicates: preview.duplicates,
				errors: parsed.errors,
			});
		} catch (err) {
			setImportPreview(null);
			setError(errorMessage(err, t("errors.import")));
		}
	};

	const handleImportConfirm = async () => {
		if (!importPreview || importPreview.accepted.length === 0) return;
		setImporting(true);
		setError(null);
		try {
			const result = await apiClient.importCustomers(
				importPreview.accepted.map((row) => ({
					customer_reference: row.customer_reference,
					name: row.name,
					onboarded_by: row.onboarded_by,
					...(row.country ? { country: row.country } : {}),
					...(row.dob ? { dob: row.dob } : {}),
					id_documents: [...row.id_documents],
				})),
			);
			await loadCustomers();
			setImportPreview(null);
			setTransferMessage(
				t("transfer.imported", {
					imported: result.customers.length,
					duplicates: importPreview.duplicates.length,
					screening: result.screening
						? t("transfer.screened", {
								customers: result.screening.customersScanned,
							})
						: t("transfer.screeningPending"),
				}),
			);
		} catch (err) {
			setError(errorMessage(err, t("errors.import")));
		} finally {
			setImporting(false);
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
			<div className="flex-between customers-header">
				<h1>{t("header.title")}</h1>
				<div className="flex-gap-sm customers-header-actions">
					<input
						ref={importInputRef}
						type="file"
						accept=".csv,.xls,.xlsx"
						onChange={handleImportFile}
						className="visually-hidden"
						aria-label={t("transfer.fileLabel")}
					/>
					<button
						type="button"
						onClick={() => importInputRef.current?.click()}
						className="btn btn-secondary btn-sm"
					>
						{t("transfer.import")}
					</button>
					<button
						type="button"
						onClick={handleExport}
						disabled={loading || importing}
						className="btn btn-secondary btn-sm"
					>
						{t("transfer.export")}
					</button>
					<button
						type="button"
						onClick={handleCheckForUpdates}
						disabled={syncing || importing}
						className="btn btn-secondary btn-sm"
					>
						{syncing ? t("header.checking") : t("header.checkUpdates")}
					</button>
				</div>
			</div>

			{syncMessage && (
				<div className="alert card-muted text-sm" role="status">
					{syncMessage}
				</div>
			)}
			{lastSynced && (
				<p className="text-muted text-sm">
					{t("sync.lastSynced", {
						version: lastSynced.version,
						time: new Date(lastSynced.at).toLocaleTimeString(),
					})}
				</p>
			)}

			{error && (
				<div className="alert alert-error">{t("alerts.error", { error })}</div>
			)}
			{transferMessage && (
				<div className="alert alert-success" role="status">
					{transferMessage}
				</div>
			)}

			{importPreview && (
				<section
					className="card card-muted transfer-preview"
					aria-live="polite"
				>
					<div className="flex-between">
						<div>
							<h2>{t("transfer.previewTitle")}</h2>
							<p className="text-muted text-sm">{importPreview.fileName}</p>
						</div>
						<button
							type="button"
							onClick={() => setImportPreview(null)}
							className="btn btn-secondary btn-sm"
							disabled={importing}
						>
							{t("transfer.cancel")}
						</button>
					</div>
					<p>
						{t("transfer.summary", {
							accepted: importPreview.accepted.length,
							duplicates: importPreview.duplicates.length,
							errors: importPreview.errors.length,
						})}
					</p>
					{importPreview.errors.length > 0 && (
						<ul className="transfer-issues text-sm">
							{importPreview.errors.slice(0, 20).map((issue) => (
								<li key={`${issue.rowNumber}-${issue.field}`}>
									{t("transfer.issue", { ...issue })}
								</li>
							))}
						</ul>
					)}
					<button
						type="button"
						onClick={handleImportConfirm}
						disabled={importing || importPreview.accepted.length === 0}
						className="btn btn-primary"
					>
						{importing
							? t("transfer.importing")
							: t("transfer.confirm", {
									count: importPreview.accepted.length,
								})}
					</button>
				</section>
			)}

			{lastResult && (
				<OnboardResultAlert
					result={lastResult}
					onDismiss={() => setLastResult(null)}
					t={t}
				/>
			)}

			<form
				onSubmit={handleOnboard}
				aria-label={t("onboard.formLabel")}
				className="card card-muted mb-lg"
			>
				<h3>{t("onboard.heading")}</h3>
				<div className="form-group form-grid">
					<div>
						<label htmlFor="customer-reference" className="form-label">
							{t("onboard.fields.reference")}
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
							{t("onboard.fields.name")}
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
							{t("onboard.fields.onboardedBy")}
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
							{t("onboard.fields.country")}
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
					<div>
						<label htmlFor="customer-dob" className="form-label">
							{t("onboard.fields.dob")}
						</label>
						<input
							id="customer-dob"
							type="date"
							value={form.dob}
							onChange={(e) => setForm({ ...form, dob: e.target.value })}
							className="form-input"
						/>
					</div>
				</div>

				<div className="form-group">
					<div className="flex-between mb-sm">
						<span className="form-label-bold">
							{t("onboard.documents.heading")}
						</span>
						<button
							type="button"
							onClick={addIdDocRow}
							className="btn btn-secondary btn-sm"
						>
							{t("onboard.documents.add")}
						</button>
					</div>
					{idDocs.length === 0 ? (
						<p className="text-muted text-sm">{t("onboard.documents.empty")}</p>
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
									aria-label={t("onboard.documents.typeAria", {
										index: index + 1,
									})}
									placeholder={t("onboard.documents.typePlaceholder")}
									value={row.doc_type}
									onChange={(e) =>
										updateIdDocRow(index, "doc_type", e.target.value)
									}
									className="form-input"
								/>
								<input
									type="text"
									aria-label={t("onboard.documents.numberAria", {
										index: index + 1,
									})}
									placeholder={t("onboard.documents.numberPlaceholder")}
									value={row.number}
									onChange={(e) =>
										updateIdDocRow(index, "number", e.target.value)
									}
									className="form-input"
								/>
								<input
									type="text"
									aria-label={t("onboard.documents.issuingCountryAria", {
										index: index + 1,
									})}
									placeholder={t("onboard.documents.issuingCountryPlaceholder")}
									maxLength={2}
									value={row.issuing_country}
									onChange={(e) =>
										updateIdDocRow(index, "issuing_country", e.target.value)
									}
									className="form-input"
								/>
								<input
									type="date"
									aria-label={t("onboard.documents.expiryAria", {
										index: index + 1,
									})}
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
									{t("onboard.documents.remove")}
								</button>
							</div>
						))
					)}
				</div>

				<button type="submit" className="btn btn-primary">
					{t("onboard.submit")}
				</button>
			</form>

			<h2>{t("list.title", { total: customers.length })}</h2>
			{loading ? (
				<p>{t("list.loading")}</p>
			) : customers.length === 0 ? (
				<p>{t("list.empty")}</p>
			) : (
				<section
					className="table-scroll"
					aria-label={t("list.title", { total: customers.length })}
				>
					<table className="table">
						<thead>
							<tr>
								<th scope="col">{t("list.columns.reference")}</th>
								<th scope="col">{t("list.columns.status")}</th>
								<th scope="col">{t("list.columns.risk")}</th>
								<th scope="col">{t("list.columns.onboardedBy")}</th>
								<th scope="col">{t("list.columns.created")}</th>
								<th scope="col" className="table-cell-right">
									{t("list.columns.actions")}
								</th>
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
											{customer.kyc_risk_rating ?? t("list.unrated")}
										</span>
									</td>
									<td>{customer.onboarded_by}</td>
									<td>{new Date(customer.created_at).toLocaleDateString()}</td>
									<td className="table-cell-right">
										<div className="flex-gap-sm">
											<select
												aria-label={t("list.controls.statusAria", {
													reference: customer.customer_reference,
												})}
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
												aria-label={t("list.controls.riskAria", {
													reference: customer.customer_reference,
												})}
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
													{t("list.controls.riskPlaceholder")}
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
														aria-label={t("list.controls.editNameAria", {
															reference: customer.customer_reference,
														})}
														value={editing.name}
														onChange={(e) =>
															setEditing({ ...editing, name: e.target.value })
														}
														className="form-input"
													/>
													<input
														type="text"
														aria-label={t("list.controls.editCountryAria", {
															reference: customer.customer_reference,
														})}
														value={editing.country}
														maxLength={2}
														onChange={(e) =>
															setEditing({
																...editing,
																country: e.target.value,
															})
														}
														className="form-input"
													/>
													<button
														type="button"
														onClick={handleEditSave}
														className="btn btn-primary btn-sm"
													>
														{t("actions.save")}
													</button>
													<button
														type="button"
														onClick={() => setEditing(null)}
														className="btn btn-secondary btn-sm"
													>
														{t("actions.cancel")}
													</button>
												</>
											) : (
												<button
													type="button"
													aria-label={t("list.controls.editAria", {
														reference: customer.customer_reference,
													})}
													onClick={() =>
														setEditing({
															customerId: customer.customer_id,
															name: customer.name,
															country: customer.country ?? "",
														})
													}
													className="btn btn-secondary btn-sm"
												>
													{t("actions.edit")}
												</button>
											)}
											<button
												type="button"
												onClick={() => handleDelete(customer.customer_id)}
												className="btn btn-danger btn-sm"
											>
												{t("actions.delete")}
											</button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			)}
		</div>
	);
}

interface OnboardResultAlertProps {
	result: CustomerOnboardResponse;
	onDismiss: () => void;
	t: TFunction;
}

function OnboardResultAlert({ result, onDismiss, t }: OnboardResultAlertProps) {
	const hasMatch = result.match_entity_ids.length > 0;
	return (
		<div className={`alert ${hasMatch ? "alert-warning" : "alert-success"}`}>
			<div className="flex-between">
				<span>
					{hasMatch ? (
						<Trans
							i18nKey="onboard.result.match"
							ns="customers"
							values={{
								reference: result.customer_reference,
								matches: result.match_entity_ids.length,
							}}
							components={{ strong: <strong /> }}
						/>
					) : (
						<Trans
							i18nKey="onboard.result.clear"
							ns="customers"
							values={{ reference: result.customer_reference }}
							components={{ strong: <strong /> }}
						/>
					)}
				</span>
				<button
					type="button"
					onClick={onDismiss}
					className="btn btn-secondary btn-sm"
				>
					{t("onboard.result.dismiss")}
				</button>
			</div>
		</div>
	);
}
