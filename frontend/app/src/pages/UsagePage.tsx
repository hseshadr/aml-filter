/** Usage dashboard page. */

import { useCallback, useEffect, useState } from "react";
import { apiClient, type UsageSummaryResponse } from "../lib/api";

export default function UsagePage() {
	const [usage, setUsage] = useState<UsageSummaryResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [days, setDays] = useState(30);

	const loadUsage = useCallback(async () => {
		try {
			setLoading(true);
			const data = await apiClient.getUsage(days);
			setUsage(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load usage");
		} finally {
			setLoading(false);
		}
	}, [days]);

	useEffect(() => {
		loadUsage();
	}, [loadUsage]);

	return (
		<div>
			<div className="page-header">
				<h1>Usage Dashboard</h1>
				<select
					value={days}
					onChange={(e) => setDays(Number.parseInt(e.target.value, 10))}
					className="form-select"
					style={{ width: "auto" }}
				>
					<option value={1}>Last 1 day</option>
					<option value={7}>Last 7 days</option>
					<option value={30}>Last 30 days</option>
				</select>
			</div>

			{error && <div className="alert alert-error">Error: {error}</div>}

			{loading ? (
				<p>Loading...</p>
			) : usage ? (
				<div>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
							gap: "1rem",
							marginBottom: "2rem",
						}}
					>
						<div className="stat-card">
							<div className="stat-label">Total Units</div>
							<div className="stat-value">
								{usage.total_units.toLocaleString()}
							</div>
						</div>
					</div>

					{Object.keys(usage.summary).length > 0 && (
						<div>
							<h2>Breakdown by Event Type</h2>
							<table className="table">
								<thead>
									<tr>
										<th>Event Type</th>
										<th className="table-cell-right">Count</th>
									</tr>
								</thead>
								<tbody>
									{Object.entries(usage.summary).map(([eventType, count]) => (
										<tr key={eventType}>
											<td>{eventType}</td>
											<td className="table-cell-right">
												{count.toLocaleString()}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			) : (
				<p>No usage data available.</p>
			)}
		</div>
	);
}
