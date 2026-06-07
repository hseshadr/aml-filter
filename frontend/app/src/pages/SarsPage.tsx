/** SAR list — filed Suspicious Activity Reports with export (the /v1/sars tier). */

import { useCallback, useEffect, useState } from "react";
import {
	apiClient,
	type SarExportFormat,
	type SarRecord,
	type SarStatus,
} from "../lib/api";

function statusBadgeClass(status: SarStatus): string {
	if (status === "EXPORTED") return "badge badge-success";
	if (status === "COMPLETED") return "badge badge-warning";
	return "badge badge-muted";
}

function errorMessage(err: unknown, fallback: string): string {
	return err instanceof Error ? err.message : fallback;
}

export default function SarsPage() {
	const [sars, setSars] = useState<SarRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [editing, setEditing] = useState<string | null>(null);
	const [draftNarrative, setDraftNarrative] = useState("");

	const loadSars = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const data = await apiClient.listSars();
			setSars(data);
		} catch (err) {
			setError(errorMessage(err, "Failed to load SARs"));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadSars();
	}, [loadSars]);

	const handleExport = async (sarId: string, format: SarExportFormat) => {
		try {
			setError(null);
			await apiClient.exportSar(sarId, format);
			await loadSars();
		} catch (err) {
			setError(errorMessage(err, "Failed to export SAR"));
		}
	};

	const startEdit = (sar: SarRecord) => {
		setEditing(sar.sar_id);
		setDraftNarrative(sar.suspicious_activity_narrative ?? "");
	};

	const handleSave = async (sarId: string) => {
		try {
			setError(null);
			const updated = await apiClient.updateSar(sarId, {
				narrative: draftNarrative,
			});
			setSars((prev) => prev.map((s) => (s.sar_id === sarId ? updated : s)));
			setEditing(null);
		} catch (err) {
			setError(errorMessage(err, "Failed to update SAR"));
		}
	};

	return (
		<div>
			<h1>Suspicious Activity Reports</h1>
			<p className="text-muted">
				SARs filed for customers who are STRONG matches to sanctioned entities.
			</p>

			{error && <div className="alert alert-error">Error: {error}</div>}

			{editing && (
				<EditNarrativePanel
					value={draftNarrative}
					onChange={setDraftNarrative}
					onSave={() => handleSave(editing)}
					onCancel={() => setEditing(null)}
				/>
			)}

			<h2>SARs ({sars.length})</h2>

			{loading ? (
				<p>Loading...</p>
			) : sars.length === 0 ? (
				<p>No SARs filed yet.</p>
			) : (
				<table className="table">
					<thead>
						<tr>
							<th>Customer</th>
							<th>Matched Entity</th>
							<th>Score</th>
							<th>Status</th>
							<th>Created</th>
							<th className="table-cell-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{sars.map((sar) => (
							<tr key={sar.sar_id}>
								<td>
									<strong>{sar.subject.customer_reference}</strong>
									<div className="text-sm text-muted">
										{sar.subject.customer_name}
									</div>
								</td>
								<td>
									<div>{sar.subject.matched_sanctioned_name}</div>
									<div className="text-sm text-muted">
										{sar.subject.matched_source_list}
									</div>
								</td>
								<td>
									<span className="badge badge-danger">
										{sar.subject.match_tier}
									</span>{" "}
									{(sar.subject.match_score * 100).toFixed(1)}%
								</td>
								<td>
									<span className={statusBadgeClass(sar.status)}>
										{sar.status}
									</span>
								</td>
								<td className="text-sm">
									{new Date(sar.created_at).toLocaleString()}
								</td>
								<td className="table-cell-right">
									<div className="flex-gap-sm">
										<button
											type="button"
											onClick={() => handleExport(sar.sar_id, "pdf")}
											className="btn btn-secondary btn-sm"
										>
											Export PDF
										</button>
										<button
											type="button"
											onClick={() => handleExport(sar.sar_id, "json")}
											className="btn btn-secondary btn-sm"
										>
											Export JSON
										</button>
										{sar.status !== "EXPORTED" && (
											<button
												type="button"
												onClick={() => startEdit(sar)}
												className="btn btn-primary btn-sm"
											>
												Edit
											</button>
										)}
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

interface EditNarrativePanelProps {
	value: string;
	onChange: (value: string) => void;
	onSave: () => void;
	onCancel: () => void;
}

function EditNarrativePanel({
	value,
	onChange,
	onSave,
	onCancel,
}: EditNarrativePanelProps) {
	return (
		<div className="card card-muted mb-lg">
			<h3>Edit Narrative</h3>
			<div className="form-group">
				<label htmlFor="edit-narrative" className="form-label">
					Suspicious Activity Narrative
				</label>
				<textarea
					id="edit-narrative"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					rows={6}
					className="form-input"
				/>
			</div>
			<div className="flex-gap-sm">
				<button type="button" onClick={onSave} className="btn btn-primary">
					Save
				</button>
				<button type="button" onClick={onCancel} className="btn btn-secondary">
					Cancel
				</button>
			</div>
		</div>
	);
}
