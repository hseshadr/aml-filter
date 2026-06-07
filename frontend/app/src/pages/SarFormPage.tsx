/** SAR filing form — prefilled from a STRONG review match (the /v1/sars tier). */

import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiClient, type SarFiler, type SarMatchContext } from "../lib/api";

const EMPTY_FILER: SarFiler = { name: "", institution: "", contact: "" };

function errorMessage(err: unknown, fallback: string): string {
	return err instanceof Error ? err.message : fallback;
}

function isMatchContext(value: unknown): value is SarMatchContext {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as SarMatchContext).match_id === "string"
	);
}

export default function SarFormPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const context = isMatchContext(location.state) ? location.state : null;
	// The review row carries customer_id directly; a match against a bare
	// whitelist entity (not onboarded) has none, and no SAR can be filed for it.
	const customerId = context?.customer_id ?? null;

	const [filer, setFiler] = useState<SarFiler>(EMPTY_FILER);
	const [narrative, setNarrative] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	if (!context) {
		return (
			<div>
				<h1>File a SAR</h1>
				<div className="alert alert-error">
					No match context. Open this form from a STRONG row on the Review
					Board.
				</div>
			</div>
		);
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!customerId) return;
		try {
			setSubmitting(true);
			setError(null);
			await apiClient.createSar({
				customer_id: customerId,
				match_id: context.match_id,
				narrative: narrative || null,
				filer,
			});
			navigate("/sars");
		} catch (err) {
			setError(errorMessage(err, "Failed to file SAR"));
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div>
			<h1>File a SAR</h1>
			<p className="text-muted">
				A Suspicious Activity Report is filed for a customer who is a STRONG
				match to a sanctioned entity.
			</p>

			{error && <div className="alert alert-error">Error: {error}</div>}

			{!customerId && (
				<div className="alert alert-error">
					This match has no onboarded customer — cannot file a SAR.
				</div>
			)}

			<SubjectCard context={context} />

			<form
				onSubmit={handleSubmit}
				aria-label="File a SAR"
				className="card card-muted mb-lg"
			>
				<h3>Filer</h3>
				<div className="form-group form-grid">
					<div>
						<label htmlFor="filer-name" className="form-label">
							Filer Name *
						</label>
						<input
							id="filer-name"
							type="text"
							value={filer.name}
							onChange={(e) => setFiler({ ...filer, name: e.target.value })}
							required
							className="form-input"
						/>
					</div>
					<div>
						<label htmlFor="filer-institution" className="form-label">
							Institution *
						</label>
						<input
							id="filer-institution"
							type="text"
							value={filer.institution}
							onChange={(e) =>
								setFiler({ ...filer, institution: e.target.value })
							}
							required
							className="form-input"
						/>
					</div>
				</div>
				<div className="form-group">
					<label htmlFor="filer-contact" className="form-label">
						Contact *
					</label>
					<input
						id="filer-contact"
						type="text"
						value={filer.contact}
						onChange={(e) => setFiler({ ...filer, contact: e.target.value })}
						required
						className="form-input"
					/>
				</div>

				<h3>Narrative</h3>
				<div className="form-group">
					<label htmlFor="sar-narrative" className="form-label">
						Suspicious Activity Narrative
					</label>
					<textarea
						id="sar-narrative"
						value={narrative}
						onChange={(e) => setNarrative(e.target.value)}
						rows={6}
						className="form-input"
					/>
				</div>

				<button
					type="submit"
					className="btn btn-primary"
					disabled={submitting || !customerId}
				>
					File SAR
				</button>
			</form>
		</div>
	);
}

interface SubjectCardProps {
	context: SarMatchContext;
}

function SubjectCard({ context }: SubjectCardProps) {
	return (
		<div className="card mb-lg">
			<h3>Subject</h3>
			<table className="table">
				<tbody>
					<tr>
						<th>Customer</th>
						<td>
							<div>{context.customer_name}</div>
							<div className="text-sm text-muted">
								{context.customer_reference}
							</div>
						</td>
					</tr>
					<tr>
						<th>Matched Entity</th>
						<td>
							<div>{context.sanctioned_name}</div>
							<div className="text-sm text-muted">{context.source_list}</div>
						</td>
					</tr>
					<tr>
						<th>Match</th>
						<td>
							<span className="badge badge-danger">{context.tier}</span>{" "}
							{(context.match_score * 100).toFixed(1)}%
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	);
}
