/** Search page with full screening interface. */

import { useState } from "react";
import {
	apiClient,
	type Match,
	type MatchReason,
	type SearchQuery,
	type SearchResponse,
} from "../lib/api";

export default function SearchPage() {
	const [query, setQuery] = useState<SearchQuery>({
		name: "",
		threshold: 0.65,
		k: 20,
	});
	const [loading, setLoading] = useState(false);
	const [results, setResults] = useState<SearchResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError(null);
		setResults(null);

		try {
			const response = await apiClient.screen(query);
			setResults(response);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Search failed");
		} finally {
			setLoading(false);
		}
	};

	const getRiskBadgeClass = (score: number): string => {
		if (score >= 0.8) return "badge badge-lg badge-danger";
		if (score >= 0.65) return "badge badge-lg badge-warning";
		return "badge badge-lg badge-success";
	};

	const exportResults = () => {
		if (!results) return;

		const csv = [
			[
				"Entity ID",
				"Score",
				"Risk Category",
				"Source List",
				"Primary Name",
				"Explanation",
			].join(","),
			...results.matches.map((m) =>
				[
					m.entity_id,
					m.score.toFixed(4),
					m.risk_category,
					m.source_list,
					`"${m.primary_name}"`,
					`"${m.explanation}"`,
				].join(","),
			),
		].join("\n");

		const blob = new Blob([csv], { type: "text/csv" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `screening-results-${Date.now()}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const formatReason = (reason: MatchReason) => {
		if (reason.description) return `${reason.signal}: ${reason.description}`;
		return `${reason.signal}: ${String(reason.value)}`;
	};

	return (
		<div>
			<h1>Entity Screening</h1>

			<form onSubmit={handleSubmit} className="mb-lg">
				<div className="form-group">
					<label htmlFor="name" className="form-label form-label-bold">
						Name *
					</label>
					<input
						id="name"
						type="text"
						value={query.name}
						onChange={(e) => setQuery({ ...query, name: e.target.value })}
						required
						placeholder="Enter entity name"
						className="form-input form-input-lg"
					/>
				</div>

				<div className="form-group form-grid">
					<div>
						<label htmlFor="dob" className="form-label">
							Date of Birth (YYYY-MM-DD)
						</label>
						<input
							id="dob"
							type="date"
							value={query.dob || ""}
							onChange={(e) =>
								setQuery({ ...query, dob: e.target.value || undefined })
							}
							className="form-input"
						/>
					</div>

					<div>
						<label htmlFor="country" className="form-label">
							Country Code
						</label>
						<input
							id="country"
							type="text"
							value={query.country || ""}
							onChange={(e) =>
								setQuery({ ...query, country: e.target.value || undefined })
							}
							placeholder="US, GB, etc."
							maxLength={2}
							className="form-input"
						/>
					</div>
				</div>

				<div className="form-group">
					<label htmlFor="entity-type" className="form-label">
						Entity Type
					</label>
					<select
						id="entity-type"
						value={query.entity_type || ""}
						onChange={(e) =>
							setQuery({
								...query,
								entity_type:
									(e.target.value as "PERSON" | "ORGANIZATION") || undefined,
							})
						}
						className="form-select"
					>
						<option value="">Any</option>
						<option value="PERSON">Person</option>
						<option value="ORGANIZATION">Organization</option>
					</select>
				</div>

				<button
					type="button"
					onClick={() => setShowAdvanced(!showAdvanced)}
					className="btn btn-secondary mb-md"
				>
					{showAdvanced ? "▼" : "▶"} Advanced Options
				</button>

				{showAdvanced && (
					<div className="card card-muted mb-md">
						<div className="form-grid">
							<div>
								<label htmlFor="threshold" className="form-label">
									Threshold: {query.threshold}
								</label>
								<input
									id="threshold"
									type="range"
									min="0"
									max="1"
									step="0.01"
									value={query.threshold}
									onChange={(e) =>
										setQuery({
											...query,
											threshold: parseFloat(e.target.value),
										})
									}
									style={{ width: "100%" }}
								/>
							</div>

							<div>
								<label htmlFor="k" className="form-label">
									Max Results (k): {query.k}
								</label>
								<input
									id="k"
									type="number"
									min="1"
									max="100"
									value={query.k}
									onChange={(e) =>
										setQuery({
											...query,
											k: Number.parseInt(e.target.value, 10) || 20,
										})
									}
									className="form-input"
								/>
							</div>
						</div>
					</div>
				)}

				<button
					type="submit"
					disabled={loading || !query.name.trim()}
					className={`btn btn-lg btn-full ${loading ? "btn-secondary" : "btn-primary"}`}
				>
					{loading ? "Searching..." : "Search"}
				</button>
			</form>

			{error && <div className="alert alert-error">Error: {error}</div>}

			{results && (
				<div>
					<div className="flex-between mb-md">
						<h2>
							Results ({results.matches.length} matches in{" "}
							{results.execution_time_ms}ms)
						</h2>
						<button
							type="button"
							onClick={exportResults}
							className="btn btn-success"
						>
							Export CSV
						</button>
					</div>

					{results.matches.length === 0 ? (
						<p>No matches found above the threshold.</p>
					) : (
						<div className="card-grid">
							{results.matches.map((match) => (
								<div
									key={match.entity_id}
									onClick={() => setSelectedMatch(match)}
									className={`card card-clickable ${selectedMatch?.entity_id === match.entity_id ? "card-selected" : ""}`}
								>
									<div className="card-header">
										<div>
											<h3 className="mb-0">{match.primary_name}</h3>
											<div className="text-sm text-muted">
												{match.entity_id} - {match.source_list}
												{match.list_version && ` (v${match.list_version})`}
											</div>
										</div>
										<div className={getRiskBadgeClass(match.score)}>
											{(match.score * 100).toFixed(1)}%
										</div>
									</div>
									<div className="mt-sm">
										<span className="badge badge-muted mr-sm">
											{match.risk_category}
										</span>
										<p className="text-sm text-muted mt-sm mb-0">
											{match.explanation}
										</p>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{selectedMatch && (
				<div className="modal-overlay" onClick={() => setSelectedMatch(null)}>
					<div className="modal-content" onClick={(e) => e.stopPropagation()}>
						<button
							type="button"
							onClick={() => setSelectedMatch(null)}
							className="btn btn-danger btn-sm modal-close"
						>
							x
						</button>
						<h2>{selectedMatch.primary_name}</h2>
						<div className="mb-md">
							<strong>Score:</strong> {(selectedMatch.score * 100).toFixed(2)}%
						</div>
						<div className="mb-md">
							<strong>Risk Category:</strong> {selectedMatch.risk_category}
						</div>
						<div className="mb-md">
							<strong>Source List:</strong> {selectedMatch.source_list}
							{selectedMatch.list_version &&
								` (v${selectedMatch.list_version})`}
						</div>
						{selectedMatch.aliases && selectedMatch.aliases.length > 0 && (
							<div className="mb-md">
								<strong>Aliases:</strong> {selectedMatch.aliases.join(", ")}
							</div>
						)}
						{selectedMatch.dob && selectedMatch.dob.length > 0 && (
							<div className="mb-md">
								<strong>Date of Birth:</strong> {selectedMatch.dob.join(", ")}
							</div>
						)}
						{selectedMatch.countries && selectedMatch.countries.length > 0 && (
							<div className="mb-md">
								<strong>Countries:</strong> {selectedMatch.countries.join(", ")}
							</div>
						)}
						<div className="mb-md">
							<strong>Explanation:</strong>
							<p>{selectedMatch.explanation}</p>
						</div>
						<div>
							<strong>Reasons:</strong>
							<ul>
								{selectedMatch.reasons.map((reason, idx) => (
									<li key={idx}>{formatReason(reason)}</li>
								))}
							</ul>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
