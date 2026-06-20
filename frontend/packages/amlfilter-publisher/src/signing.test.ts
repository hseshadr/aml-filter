import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SignatureError, verifyEd25519 } from "@amlfilter/browser/engine";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createFakeEmbedder } from "./fakeEmbedder.ts";
import { publishWatchlist } from "./publisher.ts";
import { derivePublicKey, signBytes } from "./signing.ts";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const FIXTURES = resolve(HERE, "../fixtures");
const TINY = resolve(FIXTURES, "tiny_entities.jsonl");
// The committed pinned public key the browser tier verifies against.
const PUBLIC_KEY_PATH = resolve(HERE, "../../../app/public/public.key");

/** Return a copy of `bytes` with its first byte flipped (forge the payload). */
function flipFirstByte(bytes: Uint8Array): Uint8Array {
	const out = Uint8Array.from(bytes);
	out.set([(out[0] ?? 0) ^ 0xff], 0);
	return out;
}

async function loadDemoKey(): Promise<Uint8Array> {
	return new Uint8Array(await readFile(resolve(FIXTURES, "demo.key")));
}

async function loadPublicKey(): Promise<Uint8Array> {
	return new Uint8Array(await readFile(PUBLIC_KEY_PATH));
}

describe("demo key cross-compat with the browser verifier", () => {
	test("derived public key equals the committed public.key", async () => {
		const derived = await derivePublicKey(await loadDemoKey());
		const pinned = await loadPublicKey();
		expect(Buffer.from(derived).equals(Buffer.from(pinned))).toBe(true);
	});

	test("signBytes output verifies via verifyEd25519, and tamper fails closed", async () => {
		const pub = await loadPublicKey();
		const message = new TextEncoder().encode("the exact bytes we sign");
		const sig = await signBytes(await loadDemoKey(), message);

		await expect(verifyEd25519(pub, message, sig)).resolves.toBeUndefined();

		const tampered = flipFirstByte(message);
		await expect(verifyEd25519(pub, tampered, sig)).rejects.toThrow(
			SignatureError,
		);
	});
});

describe("published files verify against public.key", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "aml-sig-"));
		await publishWatchlist({
			entitiesJsonlPath: TINY,
			version: "sig-1",
			privateKey: await loadDemoKey(),
			outDir: dir,
			embedder: createFakeEmbedder(),
			generatedAt: "2026-06-19T00:00:00Z",
		});
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	test.each([
		"watchlist.json",
		"watchlist.manifest.json",
	])("%s.sig verifies, flipping a byte fails closed", async (name) => {
		const pub = await loadPublicKey();
		const bytes = new Uint8Array(await readFile(join(dir, name)));
		const sig = await readFile(join(dir, `${name}.sig`), "utf8");

		await expect(verifyEd25519(pub, bytes, sig)).resolves.toBeUndefined();

		const tampered = flipFirstByte(bytes);
		await expect(verifyEd25519(pub, tampered, sig)).rejects.toThrow(
			SignatureError,
		);
	});
});
