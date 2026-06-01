// Node-only test helpers (Vitest): load the REAL committed signed bundle that
// ships INSIDE this package (__fixtures__/bundle/, produced by the Python
// producer via backend/scripts/gen_browser_fixture.py) so the unit tests prove
// byte-parity with the producer against a self-contained fixture. The node
// reference scopes Node types to this test-only file without leaking them into
// runtime code.
//
// NOT exported from any production barrel — imported only by *.test.ts files.

/// <reference types="node" />

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Entity } from "./domain";
import type { Preset, ScoringQuery } from "./scoring";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(HERE, "__fixtures__", "bundle");
const KEYS = join(BUNDLE, "keys");
const ORIGIN = join(BUNDLE, "origin");
const STAGING = join(BUNDLE, "staging");
const SCORING = join(HERE, "__fixtures__", "scoring");

/** One expected weighted reason in the Python-emitted scoring golden. */
export interface GoldenReason {
	readonly signal: string;
	readonly value: number | string;
	readonly weight: number;
	readonly contribution: number;
	readonly description: string;
}

/** One (entity, query) scoring case: TS-shaped input + canonical Python output. */
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
 * The cross-language scoring parity golden (produced by the Python source of
 * truth via backend/scripts/gen_scoring_golden.py). The TS scorer must reproduce
 * every case byte-for-byte; see scoring.parity.test.ts.
 */
export function scoringGolden(): ReadonlyArray<GoldenCase> {
	return JSON.parse(
		readFileSync(join(SCORING, "golden.json"), "utf-8"),
	) as GoldenCase[];
}

export function pubkeyRaw(): Uint8Array {
	return new Uint8Array(readFileSync(join(KEYS, "public.key")));
}

export function latestBytes(): Uint8Array {
	return new Uint8Array(readFileSync(join(ORIGIN, "latest")));
}

export function manifestBytes(hash: string): Uint8Array {
	return new Uint8Array(readFileSync(join(ORIGIN, "manifest", hash)));
}

export function chunkBytes(hash: string): Uint8Array {
	return new Uint8Array(readFileSync(join(ORIGIN, "chunk", hash)));
}

/** The staged (pre-bundle) entities.jsonl — for direct screening-engine tests. */
export function stagedEntities(): Uint8Array {
	return new Uint8Array(readFileSync(join(STAGING, "entities.jsonl")));
}

/** The staged vector/index.faiss — for direct vector-index reader tests. */
export function stagedIndex(): Uint8Array {
	return new Uint8Array(readFileSync(join(STAGING, "vector", "index.faiss")));
}

/** The staged vector/state.json — for direct vector-index reader tests. */
export function stagedState(): Uint8Array {
	return new Uint8Array(readFileSync(join(STAGING, "vector", "state.json")));
}

/** The staged ofac_meta.json — for direct screening-engine tests. */
export function stagedMeta(): Uint8Array {
	return new Uint8Array(readFileSync(join(STAGING, "ofac_meta.json")));
}

/**
 * A `FetchBytes` adapter backed by the real origin files, so the sync state
 * machine runs end-to-end without a network. Counts chunk requests.
 */
export function originFetch(): {
	readonly fetchBytes: (url: string) => Promise<Uint8Array>;
	chunkRequests: () => ReadonlyArray<string>;
} {
	const chunkUrls: string[] = [];
	const fetchBytes = (url: string): Promise<Uint8Array> => {
		if (url.endsWith("/latest")) {
			return Promise.resolve(latestBytes());
		}
		const manifestMatch = url.match(/\/manifest\/([0-9a-f]+)$/);
		if (manifestMatch?.[1] !== undefined) {
			return Promise.resolve(manifestBytes(manifestMatch[1]));
		}
		const chunkMatch = url.match(/\/chunk\/([0-9a-f]+)$/);
		if (chunkMatch?.[1] !== undefined) {
			chunkUrls.push(chunkMatch[1]);
			return Promise.resolve(chunkBytes(chunkMatch[1]));
		}
		return Promise.reject(new Error(`unexpected url ${url}`));
	};
	return { fetchBytes, chunkRequests: () => chunkUrls };
}
