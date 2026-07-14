// verifyPublishedOrigin — the POST-PUBLISH integrity gate (2026-07-13 outage
// follow-up): after the nightly publish deploys, re-fetch the LIVE origin and
// verify the whole trust chain THROUGH THE CLIENT'S OWN DECODE PATH — signed
// /latest pointer → manifest content hash → every chunk's zstd-decompress →
// sha256(plaintext) == content-address (the exact rule the in-tab verifier
// enforces, imported from @amlfilter/browser/engine). If the served
// representation and the content addresses ever disagree — wrong bytes, a
// stray Content-Encoding transform, a stale deploy, a truncated upload — the
// workflow fails instead of shipping a bundle the app cannot load.
//
// Library + thin CLI runner (mirrors buildRealBundle.ts / buildRealBundleMain):
//   pnpm --filter @amlfilter/publisher run verify-published-origin -- \
//     --base-url https://aml-filter.com/bundle/origin \
//     --pubkey <path to the pinned public.key> \
//     --expect-version 2026-07-13 [--attempts 10] [--delay-seconds 15]
// The full verify retries (attempts × delay) so a just-finished Pages deploy
// has time to propagate before the gate votes.

import { readFileSync } from "node:fs";
import {
	canonicalBytes,
	decompressAndVerify,
	type JsonValue,
	sha256Hex,
	verifyEd25519,
} from "@amlfilter/browser/engine";

/** The published origin failed verification (or could not be interrogated). */
export class OriginVerifyError extends Error {
	public constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "OriginVerifyError";
	}
}

/** Fetch raw bytes for an origin URL (injectable for tests). */
export type OriginFetch = (url: string) => Promise<Uint8Array>;

interface PointerWire {
	readonly manifest_hash: string;
	readonly version: string;
	readonly signature: string;
}

interface ChunkRefWire {
	readonly hash: string;
}

interface FileWire {
	readonly path: string;
	readonly chunks: ReadonlyArray<ChunkRefWire>;
}

interface ManifestWire {
	readonly files: ReadonlyArray<FileWire>;
}

export interface OriginVerifyReport {
	readonly version: string;
	readonly manifestHash: string;
	readonly files: number;
	readonly chunksVerified: number;
	readonly compressedBytes: number;
}

const DECODER = new TextDecoder();
/** Mirrors the in-tab sync worker pool, so the gate exercises the same shape. */
const VERIFY_CONCURRENCY = 8;

function parseJson<T>(bytes: Uint8Array, what: string): T {
	try {
		return JSON.parse(DECODER.decode(bytes)) as T;
	} catch (cause) {
		throw new OriginVerifyError(`published ${what} is not valid JSON`, {
			cause,
		});
	}
}

function assertPointerWire(value: unknown): asserts value is PointerWire {
	const p = value as Partial<PointerWire> | null;
	if (
		p === null ||
		typeof p !== "object" ||
		typeof p.manifest_hash !== "string" ||
		typeof p.version !== "string" ||
		typeof p.signature !== "string"
	) {
		throw new OriginVerifyError(
			"published /latest pointer is missing manifest_hash/version/signature",
		);
	}
}

function assertManifestWire(value: unknown): asserts value is ManifestWire {
	const m = value as Partial<ManifestWire> | null;
	if (m === null || typeof m !== "object" || !Array.isArray(m.files)) {
		throw new OriginVerifyError("published manifest has no files[] array");
	}
}

/** Every distinct chunk hash the manifest references. */
function distinctChunkHashes(manifest: ManifestWire): ReadonlyArray<string> {
	const hashes = new Set<string>();
	for (const file of manifest.files) {
		for (const ref of file.chunks) {
			hashes.add(ref.hash);
		}
	}
	return [...hashes];
}

async function fetchAndVerifyPointer(
	baseUrl: string,
	fetchBytes: OriginFetch,
	pubkey: Uint8Array,
): Promise<PointerWire> {
	const raw = await fetchBytes(`${baseUrl}/latest`);
	const pointer = parseJson<unknown>(raw, "/latest pointer");
	assertPointerWire(pointer);
	const message = canonicalBytes(pointer as unknown as JsonValue, {
		exclude: { signature: true },
	});
	await verifyEd25519(pubkey, message, pointer.signature);
	return pointer;
}

async function fetchAndVerifyManifest(
	baseUrl: string,
	fetchBytes: OriginFetch,
	pointer: PointerWire,
): Promise<ManifestWire> {
	const raw = await fetchBytes(`${baseUrl}/manifest/${pointer.manifest_hash}`);
	if ((await sha256Hex(raw)) !== pointer.manifest_hash) {
		throw new OriginVerifyError(
			`published manifest ${pointer.manifest_hash} failed content-address check`,
		);
	}
	const manifest = parseJson<unknown>(raw, "manifest");
	assertManifestWire(manifest);
	return manifest;
}

/** Fetch + decode-verify every chunk with a bounded pool; return bytes seen. */
async function verifyAllChunks(
	baseUrl: string,
	fetchBytes: OriginFetch,
	hashes: ReadonlyArray<string>,
): Promise<number> {
	let nextIndex = 0;
	const verifyNext = async (): Promise<number> => {
		let workerBytes = 0;
		while (nextIndex < hashes.length) {
			const hash = hashes[nextIndex];
			nextIndex += 1;
			if (hash === undefined) {
				break;
			}
			const compressed = await fetchBytes(`${baseUrl}/chunk/${hash}`);
			// THE client decode path: zstd decompress, then sha256 == name.
			await decompressAndVerify(hash, compressed);
			workerBytes += compressed.byteLength;
		}
		return workerBytes;
	};
	const workers = Array.from(
		{ length: Math.min(VERIFY_CONCURRENCY, hashes.length) },
		verifyNext,
	);
	const perWorker = await Promise.all(workers);
	return perWorker.reduce((total, bytes) => total + bytes, 0);
}

/** Verify the published origin end-to-end; throws on the first mismatch. */
export async function verifyPublishedOrigin(args: {
	readonly baseUrl: string;
	readonly fetchBytes: OriginFetch;
	readonly pubkey: Uint8Array;
	readonly expectVersion?: string;
}): Promise<OriginVerifyReport> {
	const { baseUrl, fetchBytes, pubkey, expectVersion } = args;
	const pointer = await fetchAndVerifyPointer(baseUrl, fetchBytes, pubkey);
	if (expectVersion !== undefined && pointer.version !== expectVersion) {
		throw new OriginVerifyError(
			`published pointer version is "${pointer.version}"; expected "${expectVersion}" — the deploy did not take (or has not propagated)`,
		);
	}
	const manifest = await fetchAndVerifyManifest(baseUrl, fetchBytes, pointer);
	const hashes = distinctChunkHashes(manifest);
	const compressedBytes = await verifyAllChunks(baseUrl, fetchBytes, hashes);
	return {
		version: pointer.version,
		manifestHash: pointer.manifest_hash,
		files: manifest.files.length,
		chunksVerified: hashes.length,
		compressedBytes,
	};
}

// --- CLI runner ------------------------------------------------------------

export interface VerifyCliArgs {
	readonly baseUrl: string;
	readonly pubkeyPath: string;
	readonly expectVersion?: string;
	readonly attempts: number;
	readonly delaySeconds: number;
}

/** Parse `--flag value` pairs; unknown flags and missing values fail loudly. */
export function parseVerifyArgs(argv: ReadonlyArray<string>): VerifyCliArgs {
	const values = new Map<string, string>();
	for (let i = 0; i < argv.length; i += 2) {
		const flag = argv[i];
		const value = argv[i + 1];
		if (flag === undefined || !flag.startsWith("--") || value === undefined) {
			throw new OriginVerifyError(
				`expected --flag value pairs, got "${String(flag)}"`,
			);
		}
		values.set(flag.slice(2), value);
	}
	const known = new Set([
		"base-url",
		"pubkey",
		"expect-version",
		"attempts",
		"delay-seconds",
	]);
	for (const flag of values.keys()) {
		if (!known.has(flag)) {
			throw new OriginVerifyError(`unknown flag --${flag}`);
		}
	}
	const baseUrl = values.get("base-url");
	const pubkeyPath = values.get("pubkey");
	if (baseUrl === undefined || pubkeyPath === undefined) {
		throw new OriginVerifyError("--base-url and --pubkey are required");
	}
	const attempts = Number(values.get("attempts") ?? "10");
	const delaySeconds = Number(values.get("delay-seconds") ?? "15");
	if (!Number.isInteger(attempts) || attempts < 1) {
		throw new OriginVerifyError("--attempts must be a positive integer");
	}
	if (!Number.isFinite(delaySeconds) || delaySeconds < 0) {
		throw new OriginVerifyError("--delay-seconds must be >= 0");
	}
	return {
		baseUrl: baseUrl.replace(/\/$/, ""),
		pubkeyPath,
		expectVersion: values.get("expect-version"),
		attempts,
		delaySeconds,
	};
}

/** Default transport: plain fetch, fail-closed on any non-2xx status. */
export async function httpFetchBytes(url: string): Promise<Uint8Array> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new OriginVerifyError(
			`fetch ${url} failed: ${response.status} ${response.statusText}`,
		);
	}
	return new Uint8Array(await response.arrayBuffer());
}

interface RunDeps {
	readonly fetchBytes?: OriginFetch;
	readonly readFile?: (path: string) => Uint8Array;
	readonly sleep?: (seconds: number) => Promise<void>;
	readonly log?: (line: string) => void;
}

const defaultSleep = (seconds: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, seconds * 1000));

/**
 * Run the gate from CLI argv, retrying the WHOLE verify (attempts × delay) so
 * a just-deployed origin has time to propagate. Resolves with the report on
 * the first clean pass; throws the last failure once attempts are exhausted.
 */
export async function runVerifyPublishedOrigin(
	argv: ReadonlyArray<string>,
	deps: RunDeps = {},
): Promise<OriginVerifyReport> {
	const args = parseVerifyArgs(argv);
	const fetchBytes = deps.fetchBytes ?? httpFetchBytes;
	const readFile =
		deps.readFile ?? ((path: string) => new Uint8Array(readFileSync(path)));
	const sleep = deps.sleep ?? defaultSleep;
	const log = deps.log ?? ((line: string) => console.log(line));
	const pubkey = readFile(args.pubkeyPath);

	let lastError: unknown;
	for (let attempt = 1; attempt <= args.attempts; attempt += 1) {
		try {
			const report = await verifyPublishedOrigin({
				baseUrl: args.baseUrl,
				fetchBytes,
				pubkey,
				expectVersion: args.expectVersion,
			});
			log(
				`published origin OK: version=${report.version} files=${report.files} ` +
					`chunks=${report.chunksVerified} compressedBytes=${report.compressedBytes} ` +
					`manifest=${report.manifestHash}`,
			);
			return report;
		} catch (error) {
			lastError = error;
			const message = error instanceof Error ? error.message : String(error);
			log(`attempt ${attempt}/${args.attempts} failed: ${message}`);
			if (attempt < args.attempts) {
				await sleep(args.delaySeconds);
			}
		}
	}
	throw lastError instanceof Error
		? lastError
		: new OriginVerifyError(String(lastError));
}
