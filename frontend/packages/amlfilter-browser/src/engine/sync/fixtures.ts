// Node-only test helpers (Vitest): load the REAL committed signed bundle that
// ships INSIDE this tier (sync/__fixtures__/bundle/) so the sync unit tests run
// end-to-end against a self-contained, signed fixture — verify ed25519, fetch +
// content-address chunks, decompress zstd, reassemble byte-correct. The node
// reference scopes Node types to this test-only file without leaking them into
// runtime code.
//
// NOT exported from any production barrel — imported only by the sync *.test.ts
// files. (The scoring-golden + staged-artifact helpers from the v2 original are
// intentionally omitted; they belong to the deferred bundle-parity slice.)

/// <reference types="node" />

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(HERE, "__fixtures__", "bundle");
const KEYS = join(BUNDLE, "keys");
const ORIGIN = join(BUNDLE, "origin");

/** The pinned ed25519 public key the signed bundle verifies against. */
export function pubkeyRaw(): Uint8Array {
	return new Uint8Array(readFileSync(join(KEYS, "public.key")));
}

/** Raw bytes of the signed `/latest` version pointer. */
export function latestBytes(): Uint8Array {
	return new Uint8Array(readFileSync(join(ORIGIN, "latest")));
}

/** Raw bytes of a manifest by its content hash. */
export function manifestBytes(hash: string): Uint8Array {
	return new Uint8Array(readFileSync(join(ORIGIN, "manifest", hash)));
}

/** Raw (verbatim zstd) bytes of a chunk by its content hash. */
export function chunkBytes(hash: string): Uint8Array {
	return new Uint8Array(readFileSync(join(ORIGIN, "chunk", hash)));
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
