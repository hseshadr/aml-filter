// Minimal CORS-enabled static server for the C1 e2e: serves the REAL signed
// OFAC bundle (backend/examples/catalog) so the in-tab Worker syncs over HTTP
// exactly as it does in production behind Caddy. The pinned ed25519 public key
// is NOT served here — it ships inside the SPA build (app/public/public.key)
// and is read same-origin, so the bundle origin is never trusted for the key.
// Started by Playwright's `webServer`.

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// HERE = frontend/app/tests/e2e-c1 → up 4 to the repo root, then backend/examples.
const CATALOG = join(
	HERE,
	"..",
	"..",
	"..",
	"..",
	"backend",
	"examples",
	"catalog",
);
const PORT = Number(process.env.CATALOG_PORT ?? "8911");

function send(res, status, body, type = "application/octet-stream") {
	res.writeHead(status, {
		"Content-Type": type,
		"Access-Control-Allow-Origin": "*",
		"Cache-Control": "no-store",
	});
	res.end(body);
}

async function serveCatalogFile(rel, res) {
	if (rel === "latest") {
		return send(
			res,
			200,
			await readFile(join(CATALOG, "latest")),
			"application/json",
		);
	}
	const manifest = rel.match(/^manifest\/([0-9a-f]+)$/);
	if (manifest) {
		return send(
			res,
			200,
			await readFile(join(CATALOG, "manifest", manifest[1])),
		);
	}
	const chunk = rel.match(/^chunk\/([0-9a-f]+)$/);
	if (chunk) {
		return send(res, 200, await readFile(join(CATALOG, "chunk", chunk[1])));
	}
	return send(res, 404, "not found", "text/plain");
}

const server = createServer((req, res) => {
	const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
	const path = decodeURIComponent(url.pathname).replace(/^\//, "");
	serveCatalogFile(path, res).catch((error) =>
		send(res, 500, String(error), "text/plain"),
	);
});

server.listen(PORT, () => {
	process.stdout.write(`catalog-server: serving ${CATALOG} on :${PORT}\n`);
});
