// Drift-guard: the COMMITTED demo bundle (backend/examples/catalog) must verify
// against the COMMITTED pinned public key (frontend/app/public/public.key) that
// the /screen SPA ships. These two artifacts are signed/pinned as a PAIR: a
// re-sign of the catalog without re-pinning the key (or vice versa) silently
// breaks the live demo's fail-closed boot. Today only the heavy C1 browser e2e
// would catch that; this fast Node test catches it in the normal unit run.
//
// It reuses the REAL engine functions (canonicalBytes + verifyEd25519) over the
// REAL repo files — no reimplemented crypto, no copied fixture. Paths are
// resolved from this file's location up to the repo root, the same way
// catalog-server.mjs locates the catalog.

/// <reference types="node" />

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalBytes, type JsonValue } from "./canonical";
import { verifyEd25519 } from "./crypto";
import type { VersionPointer } from "./types";

// src/engine -> packages/amlfilter-browser -> packages -> frontend -> repo root.
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..", "..", "..");
const DEMO_LATEST = join(REPO_ROOT, "backend", "examples", "catalog", "latest");
const PINNED_PUBKEY = join(
	REPO_ROOT,
	"frontend",
	"app",
	"public",
	"public.key",
);

const DECODER = new TextDecoder();

function demoPointer(): VersionPointer {
	return JSON.parse(
		DECODER.decode(readFileSync(DEMO_LATEST)),
	) as VersionPointer;
}

function pinnedPubkey(): Uint8Array {
	return new Uint8Array(readFileSync(PINNED_PUBKEY));
}

describe("committed demo bundle ↔ pinned SPA key", () => {
	it("the demo /latest signature verifies against the pinned public.key", async () => {
		const pointer = demoPointer();
		const message = canonicalBytes(pointer as unknown as JsonValue, {
			exclude: { signature: true },
		});
		await expect(
			verifyEd25519(pinnedPubkey(), message, pointer.signature),
		).resolves.toBeUndefined();
	});
});
