// mirrorPublishedOrigin — the DEPLOY-RESILIENCE gate (2026-07-30 outage).
//
// Before this existed, `deploy.yml` did `rm -rf "$ORIGIN"` and then rebuilt the
// signed bundle from the four live sanctions feeds. When Treasury's WAF started
// 403ing the OFAC fetch, that step exited non-zero and the WHOLE deploy died —
// so an unrelated docs change could not ship because a government website had a
// bad minute.
//
// The fix is NOT to ship a degraded list. It is to re-publish the EXACT bytes
// already live: fetch the currently-published origin, re-verify the whole trust
// chain (signed pointer -> manifest content-address -> every chunk through the
// client's zstd-decompress -> sha256 rule), and write those same bytes out. The
// signature is never re-made and no check is relaxed — the deploy simply keeps
// serving the last good signed bundle, and the pointer's own `version` (the
// build date) stays OLD so the staleness is visible rather than papered over.
//
// Proven here against the COMMITTED demo origin, a real signed tree that
// verifies against fixtures/demo-public.key.

import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalBytes, type JsonValue } from "@amlfilter/browser/engine";
import { describe, expect, it } from "vitest";
import {
	bundleAgeDays,
	MirrorStaleError,
	mirrorPublishedOrigin,
	parseMirrorArgs,
	runMirrorPublishedOrigin,
} from "./mirrorPublishedOrigin.ts";
import { signBytes } from "./signing.ts";
import type { OriginFetch } from "./verifyPublishedOrigin.ts";
import { verifyPublishedOrigin } from "./verifyPublishedOrigin.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_PUBLIC = join(HERE, "..", "..", "..", "app", "public");
const ORIGIN_DIR = join(APP_PUBLIC, "bundle", "origin");
const FIXTURES = join(HERE, "..", "fixtures");
const BASE = "https://aml-filter.com/bundle/origin";

const PUBKEY = new Uint8Array(readFileSync(join(FIXTURES, "demo-public.key")));
const PRIVKEY = new Uint8Array(readFileSync(join(FIXTURES, "demo.key")));

const DECODER = new TextDecoder();
const ENCODER = new TextEncoder();

/** An OriginFetch backed by the committed demo origin tree. */
function liveFetch(): OriginFetch {
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

/** Wrap a fetch so one URL gets doctored bytes. */
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

/** Re-sign the demo pointer with a chosen `version`, keeping it VALID. */
async function fetchWithVersion(version: string): Promise<OriginFetch> {
	const inner = liveFetch();
	const pointer = JSON.parse(DECODER.decode(await inner(`${BASE}/latest`))) as {
		readonly bundle_id?: string | null;
		readonly channel?: string | null;
	};
	const reversioned = { ...pointer, version };
	const message = canonicalBytes(reversioned as unknown as JsonValue, {
		exclude: {
			signature: true,
			bundle_id: reversioned.bundle_id == null,
			channel: reversioned.channel == null,
		},
	});
	const signed = {
		...reversioned,
		signature: await signBytes(PRIVKEY, message),
	};
	const bytes = ENCODER.encode(JSON.stringify(signed));
	return (url: string) =>
		url === `${BASE}/latest` ? Promise.resolve(bytes) : inner(url);
}

function outDir(): string {
	return mkdtempSync(join(tmpdir(), "aml-mirror-"));
}

/** Every file under `dir`, relative-pathed and sorted. */
function treeFiles(dir: string, prefix = ""): readonly string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir).sort()) {
		const full = join(dir, entry);
		const rel = prefix === "" ? entry : `${prefix}/${entry}`;
		if (statSync(full).isDirectory()) {
			out.push(...treeFiles(full, rel));
		} else {
			out.push(rel);
		}
	}
	return out;
}

describe("mirrorPublishedOrigin keeps the last good bundle live through a feed outage", () => {
	it("re-publishes the live signed bundle BYTE-FOR-BYTE", async () => {
		const out = outDir();

		const report = await mirrorPublishedOrigin({
			baseUrl: BASE,
			fetchBytes: liveFetch(),
			pubkey: PUBKEY,
			outDir: out,
		});

		// Same file set as the live origin — nothing dropped, nothing invented.
		expect(treeFiles(out)).toEqual(treeFiles(ORIGIN_DIR));
		// …and every byte identical: the signature is REUSED, never re-made.
		for (const rel of treeFiles(out)) {
			const parts = rel.split("/");
			expect(readFileSync(join(out, ...parts))).toEqual(
				readFileSync(join(ORIGIN_DIR, ...parts)),
			);
		}
		expect(report.chunks).toBeGreaterThan(0);
	});

	it("produces a tree that still passes the untouched publish gate", async () => {
		const out = outDir();
		await mirrorPublishedOrigin({
			baseUrl: BASE,
			fetchBytes: liveFetch(),
			pubkey: PUBKEY,
			outDir: out,
		});

		// The SAME verifier CI runs after deploy, pointed at the mirrored tree.
		const mirroredFetch: OriginFetch = (url) =>
			Promise.resolve(
				new Uint8Array(
					readFileSync(join(out, ...url.slice(BASE.length + 1).split("/"))),
				),
			);
		const verified = await verifyPublishedOrigin({
			baseUrl: BASE,
			fetchBytes: mirroredFetch,
			pubkey: PUBKEY,
		});
		expect(verified.version).toBe(
			(
				JSON.parse(readFileSync(join(ORIGIN_DIR, "latest"), "utf8")) as {
					version: string;
				}
			).version,
		);
	});

	it("surfaces the served version so the staleness is VISIBLE, not hidden", async () => {
		const out = outDir();
		const version = "2026-07-24";

		const report = await mirrorPublishedOrigin({
			baseUrl: BASE,
			fetchBytes: await fetchWithVersion(version),
			pubkey: PUBKEY,
			outDir: out,
			now: () => new Date("2026-07-30T00:00:00Z"),
		});

		expect(report.version).toBe(version);
		expect(report.ageDays).toBe(6);
		expect(report.refreshed).toBe(false);
	});

	it("REFUSES to serve a bundle older than the age ceiling", async () => {
		const out = outDir();

		await expect(
			mirrorPublishedOrigin({
				baseUrl: BASE,
				fetchBytes: await fetchWithVersion("2026-05-01"),
				pubkey: PUBKEY,
				outDir: out,
				maxServedAgeDays: 7,
				now: () => new Date("2026-07-30T00:00:00Z"),
			}),
		).rejects.toThrow(MirrorStaleError);
		// Nothing half-written: a refused mirror leaves no partial bundle.
		expect(treeFiles(out)).toEqual([]);
	});

	it("refuses a pointer whose signature does not verify", async () => {
		const out = outDir();
		const forged = tamper(
			liveFetch(),
			(url) => url.endsWith("/latest"),
			(bytes) => {
				const pointer = JSON.parse(DECODER.decode(bytes)) as {
					version: string;
				};
				// Same shape, different content, ORIGINAL signature — a forgery.
				return ENCODER.encode(
					JSON.stringify({ ...pointer, version: "2099-01-01" }),
				);
			},
		);

		await expect(
			mirrorPublishedOrigin({
				baseUrl: BASE,
				fetchBytes: forged,
				pubkey: PUBKEY,
				outDir: out,
			}),
		).rejects.toThrow();
		expect(treeFiles(out)).toEqual([]);
	});

	it("refuses a chunk whose bytes fail the client decode path", async () => {
		const out = outDir();
		const corrupted = tamper(
			liveFetch(),
			(url) => url.includes("/chunk/"),
			(bytes) => {
				const copy = new Uint8Array(bytes);
				copy[copy.length - 1] = (copy[copy.length - 1] ?? 0) ^ 0xff;
				return copy;
			},
		);

		await expect(
			mirrorPublishedOrigin({
				baseUrl: BASE,
				fetchBytes: corrupted,
				pubkey: PUBKEY,
				outDir: out,
			}),
		).rejects.toThrow();
		expect(treeFiles(out)).toEqual([]);
	});
});

describe("bundleAgeDays", () => {
	it("measures whole days from a dated build", () => {
		expect(bundleAgeDays("2026-07-24", new Date("2026-07-30T12:00:00Z"))).toBe(
			6,
		);
		expect(bundleAgeDays("2026-07-30", new Date("2026-07-30T00:00:00Z"))).toBe(
			0,
		);
	});

	it("returns null for a version that is not a date", () => {
		expect(bundleAgeDays("demo-1", new Date())).toBeNull();
		expect(bundleAgeDays("2026-7-4", new Date())).toBeNull();
		expect(bundleAgeDays("9999-99-99", new Date())).toBeNull();
	});
});

describe("the age ceiling refuses what it cannot date", () => {
	it("refuses an undateable version whenever a ceiling is in force", async () => {
		const out = outDir();
		// The committed demo pointer's version is "demo-1" — not a build date.
		await expect(
			mirrorPublishedOrigin({
				baseUrl: BASE,
				fetchBytes: liveFetch(),
				pubkey: PUBKEY,
				outDir: out,
				maxServedAgeDays: 7,
			}),
		).rejects.toThrow(MirrorStaleError);
		expect(treeFiles(out)).toEqual([]);
	});

	it("serves a bundle that is inside the ceiling", async () => {
		const out = outDir();
		const report = await mirrorPublishedOrigin({
			baseUrl: BASE,
			fetchBytes: await fetchWithVersion("2026-07-28"),
			pubkey: PUBKEY,
			outDir: out,
			maxServedAgeDays: 7,
			now: () => new Date("2026-07-30T00:00:00Z"),
		});
		expect(report.ageDays).toBe(2);
		expect(treeFiles(out).length).toBeGreaterThan(0);
	});
});

describe("parseMirrorArgs", () => {
	const base = [
		"--base-url",
		"https://aml-filter.com/bundle/origin/",
		"--pubkey",
		"/keys/public.key",
		"--out",
		"/tmp/origin",
	];

	it("accepts the required flags and strips a trailing slash", () => {
		const args = parseMirrorArgs(base);
		expect(args.baseUrl).toBe("https://aml-filter.com/bundle/origin");
		expect(args.maxServedAgeDays).toBeUndefined();
	});

	it("accepts an age ceiling", () => {
		expect(
			parseMirrorArgs([...base, "--max-age-days", "7"]).maxServedAgeDays,
		).toBe(7);
	});

	it("rejects malformed, unknown, missing and non-integer flags", () => {
		expect(() => parseMirrorArgs(["--base-url"])).toThrow(/--flag value pairs/);
		expect(() => parseMirrorArgs([...base, "--nope", "x"])).toThrow(
			/unknown flag --nope/,
		);
		expect(() => parseMirrorArgs(["--out", "/tmp/x"])).toThrow(/are required/);
		expect(() => parseMirrorArgs([...base, "--max-age-days", "-1"])).toThrow(
			/non-negative integer/,
		);
		expect(() => parseMirrorArgs([...base, "--max-age-days", "1.5"])).toThrow(
			/non-negative integer/,
		);
	});
});

describe("runMirrorPublishedOrigin (CLI)", () => {
	it("prints the SERVED_* lines the deploy workflow feeds into $GITHUB_ENV", async () => {
		const out = outDir();
		const lines: string[] = [];

		const report = await runMirrorPublishedOrigin(
			["--base-url", BASE, "--pubkey", "/ignored", "--out", out],
			{
				fetchBytes: liveFetch(),
				readFile: () => PUBKEY,
				log: (line) => lines.push(line),
			},
		);

		expect(lines).toEqual([
			`SERVED_VERSION=${report.version}`,
			`SERVED_SEQUENCE=${report.sequence}`,
			"SERVED_AGE_DAYS=unknown",
		]);
		expect(treeFiles(out).length).toBeGreaterThan(0);
	});

	it("reports a numeric age when the served bundle is dated", async () => {
		const out = outDir();
		const lines: string[] = [];

		await runMirrorPublishedOrigin(
			["--base-url", BASE, "--pubkey", "/ignored", "--out", out],
			{
				fetchBytes: await fetchWithVersion("2026-07-28"),
				readFile: () => PUBKEY,
				log: (line) => lines.push(line),
			},
		);

		expect(lines).toContain("SERVED_VERSION=2026-07-28");
		expect(lines.some((l) => /^SERVED_AGE_DAYS=\d+$/.test(l))).toBe(true);
	});
});
