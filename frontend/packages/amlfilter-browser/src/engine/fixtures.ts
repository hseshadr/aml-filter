// Node-only test helpers (Vitest): load the REAL committed signed demo
// watchlist that the /screen SPA ships (frontend/app/public/watchlist/),
// produced + signed by the v3 publisher (frontend/packages/amlfilter-publisher),
// plus the pinned public key the SPA verifies against. Tests prove fail-closed
// verification and the signed-JSON load against this committed artifact — the
// REAL one the live demo uses, not a synthetic stand-in. The node reference
// scopes Node types to this test-only file without leaking them into runtime
// code.
//
// NOT exported from any production barrel — imported only by *.test.ts files.

/// <reference types="node" />

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Entity } from "./domain";
import type { Preset, ScoringQuery } from "./scoring";

const HERE = dirname(fileURLToPath(import.meta.url));
// src/engine -> amlfilter-browser -> packages -> frontend -> repo root.
const REPO_ROOT = join(HERE, "..", "..", "..", "..", "..");
const WATCHLIST = join(REPO_ROOT, "frontend", "app", "public", "watchlist");
// The flat single-list files are gone; the OFAC per-list dir is the test target.
const WATCHLIST_OFAC = join(WATCHLIST, "ofac");
const PINNED_PUBKEY = join(
	REPO_ROOT,
	"frontend",
	"app",
	"public",
	"public.key",
);
const SCORING = join(HERE, "__fixtures__", "scoring");

const DECODER = new TextDecoder();

/** One expected weighted reason in the committed scoring snapshot. */
export interface GoldenReason {
	readonly signal: string;
	readonly value: number | string;
	readonly weight: number;
	readonly contribution: number;
	readonly description: string;
}

/** One (entity, query) scoring case: TS-shaped input + the expected output. */
export interface GoldenCase {
	readonly name: string;
	readonly preset: Preset;
	readonly entity: Entity;
	readonly query: ScoringQuery;
	readonly expected: {
		readonly score: number;
		readonly summary: string;
		readonly reasons: ReadonlyArray<GoldenReason>;
	};
}

/**
 * The scoring regression golden: a FROZEN, committed snapshot under
 * __fixtures__/scoring of the TS scorer's full output. The TS scorer is the
 * source of truth; this test fixture exists to catch unintended drift — the
 * live scorer must still reproduce every case byte-for-byte; see
 * scoring.parity.test.ts.
 */
export function scoringGolden(): ReadonlyArray<GoldenCase> {
	return JSON.parse(
		readFileSync(join(SCORING, "golden.json"), "utf-8"),
	) as GoldenCase[];
}

/** The pinned ed25519 public key the SPA ships (frontend/app/public/public.key). */
export function pubkeyRaw(): Uint8Array {
	return new Uint8Array(readFileSync(PINNED_PUBKEY));
}

/** Raw bytes of the committed signed catalog.json (the multi-list manifest). */
export function catalogBytes(): Uint8Array {
	return new Uint8Array(readFileSync(join(WATCHLIST, "catalog.json")));
}

/** The detached base64 signature over catalog.json. */
export function catalogSig(): string {
	return DECODER.decode(
		readFileSync(join(WATCHLIST, "catalog.json.sig")),
	).trim();
}

/** Raw bytes of the committed signed OFAC per-list watchlist.json. */
export function watchlistBytes(): Uint8Array {
	return new Uint8Array(readFileSync(join(WATCHLIST_OFAC, "watchlist.json")));
}

/** The detached base64 signature over the OFAC watchlist.json. */
export function watchlistSig(): string {
	return DECODER.decode(
		readFileSync(join(WATCHLIST_OFAC, "watchlist.json.sig")),
	).trim();
}

/** Raw bytes of the committed signed OFAC watchlist.manifest.json. */
export function watchlistManifestBytes(): Uint8Array {
	return new Uint8Array(
		readFileSync(join(WATCHLIST_OFAC, "watchlist.manifest.json")),
	);
}

/** The detached base64 signature over the OFAC watchlist.manifest.json. */
export function watchlistManifestSig(): string {
	return DECODER.decode(
		readFileSync(join(WATCHLIST_OFAC, "watchlist.manifest.json.sig")),
	).trim();
}
