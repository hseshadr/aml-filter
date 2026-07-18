/**
 * Return the production CSP from Cloudflare Pages' `_headers` file.
 *
 * `vite preview` does not parse `_headers`, so without this helper the local
 * production E2E lane runs with a materially weaker policy than the deployed
 * site. Fail closed when the catch-all policy is missing so the lane cannot
 * silently lose its security contract.
 */
export function cspFromHeadersFile(headersFileContent: string): string {
	const lines = headersFileContent.split("\n");
	const start = lines.findIndex((line) => line.trim() === "/*");
	if (start === -1) {
		throw new Error(
			"public/_headers has no catch-all `/*` rule — cannot derive the preview CSP",
		);
	}
	for (const line of lines.slice(start + 1)) {
		if (!/^\s+\S/.test(line)) {
			break;
		}
		const header = line.match(/^\s+Content-Security-Policy:\s*(.+?)\s*$/i);
		if (header?.[1]) {
			return header[1];
		}
	}
	throw new Error(
		"the `/*` rule in public/_headers carries no Content-Security-Policy — " +
			"preview would silently run without the production CSP",
	);
}
