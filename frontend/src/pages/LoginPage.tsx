/** Login page for API key authentication. */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
	const [apiKey, setApiKey] = useState("");
	const [error, setError] = useState<string | null>(null);
	const { setApiKey: setAuthApiKey } = useAuth();
	const navigate = useNavigate();

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		if (!apiKey.trim()) {
			setError("API key is required");
			return;
		}

		// Set API key and navigate to home
		setAuthApiKey(apiKey.trim());
		navigate("/");
	};

	return (
		<div style={{ maxWidth: "400px", margin: "2rem auto" }}>
			<h1>Login</h1>
			<p>Enter your API key to access the AML-Filter dashboard.</p>

			<form onSubmit={handleSubmit}>
				<div className="form-group">
					<label htmlFor="api-key" className="form-label">
						API Key
					</label>
					<input
						id="api-key"
						type="password"
						value={apiKey}
						onChange={(e) => setApiKey(e.target.value)}
						placeholder="Enter your API key"
						className="form-input"
					/>
				</div>

				{error && <div className="text-danger mb-md">{error}</div>}

				<button type="submit" className="btn btn-primary btn-full">
					Login
				</button>
			</form>

			<div className="mt-lg text-sm text-muted">
				<p>Don't have an API key?</p>
				<p>
					Contact your administrator or create one in the{" "}
					<a href="/api-keys">API Keys</a> section.
				</p>
			</div>
		</div>
	);
}
