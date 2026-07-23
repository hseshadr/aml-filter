import { resolve, sep } from "node:path";

/** Content types the dev middleware serves the staged ORT runtime files as. */
const ORT_ASSET_MIME: Readonly<Record<string, string>> = {
	".mjs": "text/javascript",
	".wasm": "application/wasm",
};

/** A resolved, in-bounds ORT asset the dev middleware may serve raw. */
export interface OrtAsset {
	readonly file: string;
	readonly contentType: string;
}

/**
 * Resolve a dev-server `/ort/<file>` request to an ABSOLUTE path inside the
 * staged `<publicDir>/ort` directory, or `null` when the request either is not
 * an ORT asset OR escapes that directory via path traversal
 * (e.g. `/ort/../../../etc/passwd.wasm`, which a browser normalizes away but a
 * raw HTTP client can still send). Pure + exported so the traversal guard is
 * unit-tested without booting a dev server.
 */
export function resolveOrtAsset(
	publicDir: string,
	urlPath: string,
): OrtAsset | null {
	const entry = Object.entries(ORT_ASSET_MIME).find(([ext]) =>
		urlPath.endsWith(ext),
	);
	if (!urlPath.startsWith("/ort/") || entry === undefined) {
		return null;
	}
	const [, contentType] = entry;
	const ortDir = resolve(publicDir, "ort");
	// `.${urlPath}` turns the absolute request path "/ort/x" into "./ort/x" so it
	// resolves relative to publicDir; a `..` segment then resolves OUTSIDE ortDir.
	const file = resolve(publicDir, `.${urlPath}`);
	if (!file.startsWith(ortDir + sep)) {
		return null;
	}
	return { file, contentType };
}
