/** API Keys management page. */

import { useEffect, useState } from "react";
import {
	type ApiKeyCreateResponse,
	type ApiKeyResponse,
	apiClient,
} from "../lib/api";

export default function ApiKeysPage() {
	const [keys, setKeys] = useState<ApiKeyResponse[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [newKeyName, setNewKeyName] = useState("");
	const [newKeyExpires, setNewKeyExpires] = useState<number | undefined>();
	const [createdKey, setCreatedKey] = useState<ApiKeyCreateResponse | null>(
		null,
	);

	useEffect(() => {
		loadKeys();
	}, []);

	const loadKeys = async () => {
		try {
			setLoading(true);
			const data = await apiClient.listApiKeys();
			setKeys(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load API keys");
		} finally {
			setLoading(false);
		}
	};

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			const response = await apiClient.createApiKey({
				name: newKeyName || undefined,
				expires_in_days: newKeyExpires,
			});
			setCreatedKey(response);
			setShowCreateForm(false);
			setNewKeyName("");
			setNewKeyExpires(undefined);
			await loadKeys();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create API key");
		}
	};

	const handleRevoke = async (keyId: string) => {
		if (!confirm("Are you sure you want to revoke this API key?")) return;

		try {
			await apiClient.revokeApiKey(keyId);
			await loadKeys();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to revoke API key");
		}
	};

	return (
		<div>
			<div className="page-header">
				<h1>API Keys</h1>
				<button
					type="button"
					onClick={() => setShowCreateForm(!showCreateForm)}
					className="btn btn-primary"
				>
					Create API Key
				</button>
			</div>

			{createdKey && (
				<div className="alert alert-success">
					<h3>API Key Created!</h3>
					<p>
						<strong>Important:</strong> Copy this key now. You won't be able to
						see it again.
					</p>
					<div className="card card-muted mt-sm">
						<code className="text-mono">{createdKey.api_key}</code>
					</div>
					<div className="mt-sm">
						<button
							type="button"
							onClick={() => {
								navigator.clipboard.writeText(createdKey.api_key);
								alert("Copied to clipboard!");
							}}
							className="btn btn-success mr-sm"
						>
							Copy to Clipboard
						</button>
						<button
							type="button"
							onClick={() => setCreatedKey(null)}
							className="btn btn-secondary"
						>
							Close
						</button>
					</div>
				</div>
			)}

			{showCreateForm && (
				<form onSubmit={handleCreate} className="card card-muted mb-lg">
					<h3>Create New API Key</h3>
					<div className="form-group">
						<label htmlFor="key-name" className="form-label">
							Name (optional)
						</label>
						<input
							id="key-name"
							type="text"
							value={newKeyName}
							onChange={(e) => setNewKeyName(e.target.value)}
							placeholder="e.g., Production Key"
							className="form-input"
						/>
					</div>
					<div className="form-group">
						<label htmlFor="key-expires" className="form-label">
							Expires in (days, optional)
						</label>
						<input
							id="key-expires"
							type="number"
							min="1"
							value={newKeyExpires || ""}
							onChange={(e) =>
								setNewKeyExpires(
									e.target.value
										? Number.parseInt(e.target.value, 10)
										: undefined,
								)
							}
							placeholder="Leave empty for no expiration"
							className="form-input"
						/>
					</div>
					<div>
						<button type="submit" className="btn btn-success mr-sm">
							Create
						</button>
						<button
							type="button"
							onClick={() => setShowCreateForm(false)}
							className="btn btn-secondary"
						>
							Cancel
						</button>
					</div>
				</form>
			)}

			{error && <div className="alert alert-error">Error: {error}</div>}

			{loading ? (
				<p>Loading...</p>
			) : keys.length === 0 ? (
				<p>No API keys found. Create one to get started.</p>
			) : (
				<table className="table">
					<thead>
						<tr>
							<th>Name</th>
							<th>Created</th>
							<th>Expires</th>
							<th>Last Used</th>
							<th>Status</th>
							<th className="table-cell-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{keys.map((key) => (
							<tr key={key.key_id}>
								<td>{key.name || "(Unnamed)"}</td>
								<td>{new Date(key.created_at).toLocaleDateString()}</td>
								<td>
									{key.expires_at
										? new Date(key.expires_at).toLocaleDateString()
										: "Never"}
								</td>
								<td>
									{key.last_used_at
										? new Date(key.last_used_at).toLocaleString()
										: "Never"}
								</td>
								<td>
									{key.revoked_at ? (
										<span className="text-danger">Revoked</span>
									) : (
										<span className="text-success">Active</span>
									)}
								</td>
								<td className="table-cell-right">
									{!key.revoked_at && (
										<button
											type="button"
											onClick={() => handleRevoke(key.key_id)}
											className="btn btn-danger btn-sm"
										>
											Revoke
										</button>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}
