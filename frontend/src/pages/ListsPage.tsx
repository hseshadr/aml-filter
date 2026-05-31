/** Lists management page. */

import { useEffect, useState } from "react";
import { apiClient, type ListConfigResponse } from "../lib/api";

export default function ListsPage() {
	const [lists, setLists] = useState<ListConfigResponse[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		loadLists();
	}, []);

	const loadLists = async () => {
		try {
			setLoading(true);
			const data = await apiClient.listLists();
			setLists(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load lists");
		} finally {
			setLoading(false);
		}
	};

	const handleToggle = async (listId: string, enabled: boolean) => {
		try {
			await apiClient.updateListConfig(listId, { enabled });
			await loadLists();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update list");
		}
	};

	return (
		<div>
			<h1>Compliance Lists</h1>
			<p>Enable or disable compliance lists for your tenant.</p>

			{error && <div className="alert alert-error">Error: {error}</div>}

			{loading ? (
				<p>Loading...</p>
			) : lists.length === 0 ? (
				<p>No lists available.</p>
			) : (
				<div className="card-grid">
					{lists.map((list) => (
						<div key={list.list_id} className="card flex-between">
							<div className="flex-1">
								<h3 className="mb-sm">{list.list_id}</h3>
								<div className="text-sm text-muted">
									{list.current_version && (
										<div>Current Version: {list.current_version}</div>
									)}
									{list.version_override && (
										<div>Override: {list.version_override}</div>
									)}
									{list.updated_at && (
										<div>
											Updated: {new Date(list.updated_at).toLocaleString()}
										</div>
									)}
								</div>
							</div>
							<div>
								<label
									className="flex flex-gap-sm"
									style={{ cursor: "pointer" }}
								>
									<input
										type="checkbox"
										checked={list.enabled}
										onChange={(e) =>
											handleToggle(list.list_id, e.target.checked)
										}
									/>
									<span>{list.enabled ? "Enabled" : "Disabled"}</span>
								</label>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
