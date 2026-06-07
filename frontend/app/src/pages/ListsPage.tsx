/** Compliance lists management page (the /v1/lists tier).
 *
 * Renders the union of every available sanctions list merged with this
 * tenant's per-list config. A list that is available but not yet configured
 * shows as disabled; toggling it on persists a config via PUT (which creates
 * it server-side if absent).
 */

import { useCallback, useEffect, useState } from "react";
import {
	type AvailableList,
	apiClient,
	type ListConfigResponse,
} from "../lib/api";

/** A list row: its config if the tenant has one, otherwise a disabled default. */
interface ListRow {
	list_id: string;
	enabled: boolean;
	current_version: string | null;
	version_override: string | null;
	updated_at: string | null;
}

function errorMessage(err: unknown, fallback: string): string {
	return err instanceof Error ? err.message : fallback;
}

/** Merge available lists with tenant configs into one row per available list. */
function mergeRows(
	available: AvailableList[],
	configs: ListConfigResponse[],
): ListRow[] {
	const byId = new Map(configs.map((config) => [config.list_id, config]));
	return available.map((list) => {
		const config = byId.get(list.list_id);
		return {
			list_id: list.list_id,
			enabled: config?.enabled ?? false,
			current_version: config?.current_version ?? null,
			version_override: config?.version_override ?? null,
			updated_at: config?.updated_at ?? null,
		};
	});
}

export default function ListsPage() {
	const [rows, setRows] = useState<ListRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadLists = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const [available, configs] = await Promise.all([
				apiClient.getAvailableLists(),
				apiClient.listLists(),
			]);
			setRows(mergeRows(available, configs));
		} catch (err) {
			setError(errorMessage(err, "Failed to load lists"));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadLists();
	}, [loadLists]);

	const handleToggle = async (listId: string, enabled: boolean) => {
		try {
			setError(null);
			const updated = await apiClient.updateListConfig(listId, { enabled });
			setRows((prev) =>
				prev.map((row) =>
					row.list_id === listId
						? {
								...row,
								enabled: updated.enabled,
								current_version: updated.current_version ?? null,
								version_override: updated.version_override ?? null,
								updated_at: updated.updated_at ?? null,
							}
						: row,
				),
			);
		} catch (err) {
			setError(errorMessage(err, "Failed to update list"));
		}
	};

	return (
		<div>
			<h1>Compliance Lists</h1>
			<p>Enable or disable sanctions lists for your tenant.</p>

			{error && <div className="alert alert-error">Error: {error}</div>}

			{loading ? (
				<p>Loading...</p>
			) : rows.length === 0 ? (
				<p>No lists available.</p>
			) : (
				<table className="table">
					<thead>
						<tr>
							<th>List</th>
							<th>Status</th>
							<th>Version</th>
							<th>Last Updated</th>
							<th className="table-cell-right">Enabled</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<ListTableRow
								key={row.list_id}
								row={row}
								onToggle={handleToggle}
							/>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

interface ListTableRowProps {
	row: ListRow;
	onToggle: (listId: string, enabled: boolean) => void;
}

function ListTableRow({ row, onToggle }: ListTableRowProps) {
	const badgeClass = row.enabled ? "badge badge-success" : "badge badge-muted";
	return (
		<tr>
			<td>{row.list_id}</td>
			<td>
				<span className={badgeClass}>
					{row.enabled ? "Active" : "Disabled"}
				</span>
			</td>
			<td>
				{row.current_version ? (
					<span>{row.current_version}</span>
				) : (
					<span className="text-muted">—</span>
				)}
				{row.version_override && (
					<div className="text-sm text-muted">
						override: {row.version_override}
					</div>
				)}
			</td>
			<td>
				{row.updated_at ? (
					new Date(row.updated_at).toLocaleString()
				) : (
					<span className="text-muted">—</span>
				)}
			</td>
			<td className="table-cell-right">
				<input
					type="checkbox"
					aria-label={`Enable ${row.list_id}`}
					checked={row.enabled}
					onChange={(e) => onToggle(row.list_id, e.target.checked)}
				/>
			</td>
		</tr>
	);
}
