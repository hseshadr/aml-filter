#!/usr/bin/env node
// Live-smoke rehearsal target: a localhost reverse proxy in front of the REAL
// deployed site that can deliberately break one property, so the live smoke
// can be watched going RED against the real app + real signed bundle.
//
//   TAMPER=none     pass every byte through (the smoke must be GREEN)
//   TAMPER=chunk    flip one byte in every /bundle/origin/chunk/* response —
//                   a tampered bundle chunk; in-tab verification must refuse it
//   TAMPER=pointer  forge the signed /bundle/origin/latest pointer: still valid
//                   JSON, but `sequence` bumped by one, so only the Ed25519
//                   signature can catch it. The pointer is re-fetched on every
//                   load, so a RETURNING visitor with a cached bundle must be
//                   refused too
//
// http://localhost is a secure context (WebCrypto + OPFS work), which is why
// the rehearsal runs on the host, not behind a container hostname.
//
// Usage (from frontend/app):
//   TAMPER=chunk node scripts/live-smoke-rehearsal.mjs &
//   LIVE_SMOKE_URL=http://localhost:4191 pnpm test:e2e:live --grep @fresh

import { createServer } from "node:http";

const UPSTREAM = process.env.REHEARSAL_UPSTREAM ?? "https://aml-filter.com";
const PORT = Number(process.env.REHEARSAL_PORT ?? 4191);
const TAMPER = process.env.TAMPER ?? "none";
const MODES = new Set(["none", "chunk", "pointer"]);
// Node's fetch already decoded the body, and the length/encoding change.
const DROPPED = new Set([
	"content-encoding",
	"content-length",
	"transfer-encoding",
	"connection",
	"strict-transport-security",
]);

if (!MODES.has(TAMPER)) {
	throw new Error(`TAMPER must be one of ${[...MODES].join(", ")}`);
}

function shouldTamper(path) {
	if (TAMPER === "chunk") {
		return path.startsWith("/bundle/origin/chunk/");
	}
	return TAMPER === "pointer" && path === "/bundle/origin/latest";
}

function forgePointer(bytes) {
	const pointer = JSON.parse(new TextDecoder().decode(bytes));
	pointer.sequence += 1;
	return new TextEncoder().encode(JSON.stringify(pointer));
}

function tamper(path, bytes) {
	return path.endsWith("/latest") ? forgePointer(bytes) : flipLastByte(bytes);
}

function flipLastByte(bytes) {
	const out = new Uint8Array(bytes);
	if (out.length > 0) {
		out[out.length - 1] ^= 0xff;
	}
	return out;
}

/** The live CSP upgrades insecure requests; on http://localhost that would
 * send every subresource to https://localhost, so drop just that directive. */
function localHeader(name, value) {
	if (name !== "content-security-policy") {
		return value;
	}
	return value
		.split(";")
		.filter((part) => part.trim() !== "upgrade-insecure-requests")
		.join(";");
}

async function proxy(request, response) {
	const path = new URL(request.url ?? "/", "http://localhost").pathname;
	const upstream = await fetch(`${UPSTREAM}${request.url}`, {
		method: request.method,
		redirect: "manual",
		headers: { "user-agent": request.headers["user-agent"] ?? "rehearsal" },
	});
	const body = new Uint8Array(await upstream.arrayBuffer());
	for (const [name, value] of upstream.headers) {
		if (!DROPPED.has(name)) {
			response.setHeader(name, localHeader(name, value));
		}
	}
	const tampered = shouldTamper(path);
	if (tampered) {
		process.stdout.write(`tampered ${path}\n`);
	}
	response.writeHead(upstream.status);
	response.end(tampered ? tamper(path, body) : body);
}

createServer((request, response) => {
	proxy(request, response).catch((error) => {
		response.writeHead(502);
		response.end(String(error));
	});
}).listen(PORT, "127.0.0.1", () => {
	process.stdout.write(
		`rehearsal proxy on http://localhost:${PORT} -> ${UPSTREAM} (TAMPER=${TAMPER})\n`,
	);
});
