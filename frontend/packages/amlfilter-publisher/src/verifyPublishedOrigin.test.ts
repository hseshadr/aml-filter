// The post-publish origin gate, proven against the COMMITTED demo bundle
// (frontend/app/public/bundle/origin — a real signed origin that verifies
// against the pinned frontend/app/public/public.key). The suite drives the
// exact checks CI runs against the live origin after every deploy: signed
// pointer → manifest content hash → every chunk through the client's
// zstd-decompress → content-address rule — plus the failure classes that
// motivated the gate (the 2026-07-13 outage class: served chunk bytes that do
// not verify), and the CLI runner's retry/propagation loop.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { IntegrityError, SignatureError } from "@amlfilter/browser/engine";
import { describe, expect, it } from "vitest";
import * as originVerifier from "./verifyPublishedOrigin.ts";
import {
	httpFetchBytes,
	type OriginFetch,
	OriginVerifyError,
	parseVerifyArgs,
	runVerifyPublishedOrigin,
	verifyPublishedOrigin,
} from "./verifyPublishedOrigin.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_PUBLIC = join(HERE, "..", "..", "..", "app", "public");
const ORIGIN_DIR = join(APP_PUBLIC, "bundle", "origin");
const BASE = "https://origin.test/bundle/origin";

const PUBKEY = new Uint8Array(readFileSync(join(APP_PUBLIC, "public.key")));

/** An OriginFetch backed by the committed demo origin tree. */
function fixtureFetch(): OriginFetch {
	return (url: string) => {
		if (!url.startsWith(`${BASE}/`)) {
			return Promise.reject(new Error(`unexpected url ${url}`));
		}
		const rel = url.slice(BASE.length + 1).split("/");
		return Promise.resolve(
			new Uint8Array(readFileSync(join(ORIGIN_DIR, ...rel))),
		);
	};
}

function demoVersion(): string {
	const latest = JSON.parse(
		readFileSync(join(ORIGIN_DIR, "latest"), "utf8"),
	) as { version: string };
	return latest.version;
}

/** Wrap a fetch so one URL suffix gets doctored bytes. */
function tamper(
	inner: OriginFetch,
	match: (url: string) => boolean,
	doctor: (bytes: Uint8Array) => Uint8Array,
): OriginFetch {
	return async (url) => {
		const bytes = await inner(url);
		return match(url) ? doctor(bytes) : bytes;
	};
}

async function firstChunkUrl(): Promise<string> {
	const fetchBytes = fixtureFetch();
	const latest = JSON.parse(
		new TextDecoder().decode(await fetchBytes(`${BASE}/latest`)),
	) as { manifest_hash: string };
	const manifest = JSON.parse(
		new TextDecoder().decode(
			await fetchBytes(`${BASE}/manifest/${latest.manifest_hash}`),
		),
	) as { files: ReadonlyArray<{ chunks: ReadonlyArray<{ hash: string }> }> };
	const hash = manifest.files[0]?.chunks[0]?.hash;
	if (hash === undefined) {
		throw new Error("demo manifest has no chunks");
	}
	return `${BASE}/chunk/${hash}`;
}

describe("verifyPublishedOrigin against the committed demo origin", () => {
	it("verifies the whole chain and reports what it checked", async () => {
		const report = await verifyPublishedOrigin({
			baseUrl: BASE,
			fetchBytes: fixtureFetch(),
			pubkey: PUBKEY,
			expectVersion: demoVersion(),
		});
		expect(report.version).toBe(demoVersion());
		expect(report.files).toBeGreaterThan(0);
		expect(report.chunksVerified).toBeGreaterThan(0);
		expect(report.compressedBytes).toBeGreaterThan(0);
	});

	it("rejects a chunk served as zero bytes (the 2026-07-13 outage class)", async () => {
		const target = await firstChunkUrl();
		const fetchBytes = tamper(
			fixtureFetch(),
			(url) => url === target,
			() => new Uint8Array(0),
		);
		await expect(
			verifyPublishedOrigin({ baseUrl: BASE, fetchBytes, pubkey: PUBKEY }),
		).rejects.toThrow(/failed content-address check/);
	});

	it("rejects a chunk whose served bytes are corrupted", async () => {
		const target = await firstChunkUrl();
		const fetchBytes = tamper(
			fixtureFetch(),
			(url) => url === target,
			(bytes) => {
				const doctored = bytes.slice();
				doctored[12] = (doctored[12] ?? 0) ^ 0xff;
				return doctored;
			},
		);
		await expect(
			verifyPublishedOrigin({ baseUrl: BASE, fetchBytes, pubkey: PUBKEY }),
		).rejects.toBeInstanceOf(IntegrityError);
	});

	it("rejects a manifest whose served bytes do not hash to the pointer", async () => {
		const fetchBytes = tamper(
			fixtureFetch(),
			(url) => url.includes("/manifest/"),
			(bytes) => new Uint8Array([...bytes, 0x20]),
		);
		await expect(
			verifyPublishedOrigin({ baseUrl: BASE, fetchBytes, pubkey: PUBKEY }),
		).rejects.toThrow(/manifest .* failed content-address check/);
	});

	it("rejects a tampered pointer signature", async () => {
		const fetchBytes = tamper(
			fixtureFetch(),
			(url) => url.endsWith("/latest"),
			(bytes) => {
				const text = new TextDecoder().decode(bytes);
				const pointer = JSON.parse(text) as { version: string };
				pointer.version = `${pointer.version}-doctored`;
				return new TextEncoder().encode(JSON.stringify(pointer));
			},
		);
		await expect(
			verifyPublishedOrigin({ baseUrl: BASE, fetchBytes, pubkey: PUBKEY }),
		).rejects.toBeInstanceOf(SignatureError);
	});

	it("rejects a stale deploy: pointer version != the version just published", async () => {
		await expect(
			verifyPublishedOrigin({
				baseUrl: BASE,
				fetchBytes: fixtureFetch(),
				pubkey: PUBKEY,
				expectVersion: "2099-01-01",
			}),
		).rejects.toThrow(/expected "2099-01-01"/);
	});

	it("rejects a published pointer without the expected monotonic sequence", async () => {
		await expect(
			verifyPublishedOrigin({
				baseUrl: BASE,
				fetchBytes: fixtureFetch(),
				pubkey: PUBKEY,
				expectSequence: 29_433_222_924,
			}),
		).rejects.toThrow(/sequence/i);
	});
});

describe("next published monotonic sequence", () => {
	type SequenceModule = {
		readonly sequenceAfterLive: (current: number) => number;
		readonly nextPublishedSequence: (args: {
			readonly baseUrl: string;
			readonly fetchBytes: OriginFetch;
			readonly pubkey: Uint8Array;
		}) => Promise<number>;
		readonly runNextPublishedSequence: (
			argv: ReadonlyArray<string>,
			deps: {
				readonly fetchBytes: OriginFetch;
				readonly readFile: (path: string) => Uint8Array;
				readonly log: (line: string) => void;
			},
		) => Promise<number>;
	};
	const sequenceModule = originVerifier as unknown as Partial<SequenceModule>;

	it("increments the verified live pointer, independent of an older workflow run id", async () => {
		expect(sequenceModule.sequenceAfterLive).toBeTypeOf("function");
		const live = JSON.parse(
			new TextDecoder().decode(await fixtureFetch()(`${BASE}/latest`)),
		) as { sequence: number };
		expect(sequenceModule.sequenceAfterLive?.(live.sequence)).toBe(
			live.sequence + 1,
		);
		// A rerun of an old GitHub workflow still derives from LIVE state; no run id
		// participates in this operation.
		expect(sequenceModule.sequenceAfterLive?.(50_000)).toBe(50_001);
	});

	it("fetches and signature-verifies the live pointer before incrementing", async () => {
		expect(sequenceModule.nextPublishedSequence).toBeTypeOf("function");
		const live = JSON.parse(
			new TextDecoder().decode(await fixtureFetch()(`${BASE}/latest`)),
		) as { sequence: number };
		await expect(
			sequenceModule.nextPublishedSequence?.({
				baseUrl: BASE,
				fetchBytes: fixtureFetch(),
				pubkey: PUBKEY,
			}),
		).resolves.toBe(live.sequence + 1);
	});

	it("rejects a tampered live pointer instead of deriving from it", async () => {
		const fetchBytes = tamper(
			fixtureFetch(),
			(url) => url.endsWith("/latest"),
			(bytes) => {
				const pointer = JSON.parse(new TextDecoder().decode(bytes)) as {
					sequence: number;
				};
				pointer.sequence += 1;
				return new TextEncoder().encode(JSON.stringify(pointer));
			},
		);
		await expect(
			sequenceModule.nextPublishedSequence?.({
				baseUrl: BASE,
				fetchBytes,
				pubkey: PUBKEY,
			}),
		).rejects.toBeInstanceOf(SignatureError);
	});

	it("refuses to overflow JavaScript's safe-integer sequence space", () => {
		expect(() =>
			sequenceModule.sequenceAfterLive?.(Number.MAX_SAFE_INTEGER),
		).toThrow(/safe integer/i);
	});

	it("prints one shell-safe decimal candidate for workflow consumption", async () => {
		expect(sequenceModule.runNextPublishedSequence).toBeTypeOf("function");
		const lines: string[] = [];
		const sequence = await sequenceModule.runNextPublishedSequence?.(
			["--base-url", BASE, "--pubkey", join(APP_PUBLIC, "public.key")],
			{
				fetchBytes: fixtureFetch(),
				readFile: () => PUBKEY,
				log: (line) => lines.push(line),
			},
		);
		expect(lines).toEqual([String(sequence)]);
		expect(sequence).toBeGreaterThan(0);
	});
});

describe("parseVerifyArgs", () => {
	it("parses flags and applies defaults", () => {
		const args = parseVerifyArgs([
			"--base-url",
			"https://aml-filter.com/bundle/origin/",
			"--pubkey",
			"public.key",
			"--expect-version",
			"2026-07-13",
			"--expect-sequence",
			"29433222924",
		]);
		expect(args).toEqual({
			baseUrl: "https://aml-filter.com/bundle/origin",
			pubkeyPath: "public.key",
			expectVersion: "2026-07-13",
			expectSequence: 29_433_222_924,
			attempts: 10,
			delaySeconds: 15,
		});
	});

	it.each([
		[[], /--base-url and --pubkey are required/],
		[["--base-url"], /expected --flag value pairs/],
		[["--nope", "x"], /unknown flag --nope/],
		[
			["--base-url", "u", "--pubkey", "k", "--attempts", "0"],
			/--attempts must be a positive integer/,
		],
		[
			["--base-url", "u", "--pubkey", "k", "--delay-seconds", "-1"],
			/--delay-seconds must be >= 0/,
		],
	])("rejects bad argv %j", (argv, message) => {
		expect(() => parseVerifyArgs(argv as ReadonlyArray<string>)).toThrow(
			message,
		);
	});
});

describe("runVerifyPublishedOrigin (CLI runner)", () => {
	const CLI = [
		"--base-url",
		BASE,
		"--pubkey",
		join(APP_PUBLIC, "public.key"),
		"--delay-seconds",
		"0",
	];

	it("retries through a propagation window, then reports success", async () => {
		let calls = 0;
		const flaky: OriginFetch = (url) => {
			calls += 1;
			if (calls <= 1) {
				return Promise.reject(
					new OriginVerifyError("fetch failed: 522 origin unreachable"),
				);
			}
			return fixtureFetch()(url);
		};
		const lines: string[] = [];
		const report = await runVerifyPublishedOrigin([...CLI, "--attempts", "3"], {
			fetchBytes: flaky,
			sleep: () => Promise.resolve(),
			log: (line) => lines.push(line),
		});
		expect(report.chunksVerified).toBeGreaterThan(0);
		expect(lines.some((line) => line.includes("attempt 1/3 failed"))).toBe(
			true,
		);
		expect(lines.some((line) => line.includes("published origin OK"))).toBe(
			true,
		);
	});

	it("throws the last failure once attempts are exhausted", async () => {
		const dead: OriginFetch = () =>
			Promise.reject(new OriginVerifyError("fetch failed: 522"));
		await expect(
			runVerifyPublishedOrigin([...CLI, "--attempts", "2"], {
				fetchBytes: dead,
				sleep: () => Promise.resolve(),
				log: () => {},
			}),
		).rejects.toThrow(/522/);
	});
});

describe("httpFetchBytes", () => {
	it("fails closed on a non-2xx response", async () => {
		// A well-known always-404 (no network: use a data-less local server is
		// overkill) — stub global fetch instead.
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response("nope", { status: 404, statusText: "Not Found" }),
			)) as typeof fetch;
		try {
			await expect(httpFetchBytes("https://x/latest")).rejects.toThrow(
				/404 Not Found/,
			);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("returns the raw bytes on success", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (() =>
			Promise.resolve(new Response(new Uint8Array([1, 2, 3])))) as typeof fetch;
		try {
			await expect(httpFetchBytes("https://x/latest")).resolves.toEqual(
				new Uint8Array([1, 2, 3]),
			);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
