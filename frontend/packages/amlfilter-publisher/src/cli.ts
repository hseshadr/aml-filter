#!/usr/bin/env node
// amlfilter-publish — publish a signed watchlist from a source-entities JSONL.
//
//   amlfilter-publish --in <jsonl> --version <v> --key <privkey-file> \
//                     --out <dir> [--models <dir>]
//
// --key is a raw 32-byte Ed25519 seed file. --models is the directory that
// CONTAINS the Xenova/all-MiniLM-L6-v2/... layout (defaults to the repo's
// frontend/app/public/models). Fails loud on missing/invalid args.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createNodeEmbedder } from "./nodeEmbedder.ts";
import { publishWatchlist } from "./publisher.ts";

interface CliArgs {
	readonly in: string;
	readonly version: string;
	readonly key: string;
	readonly out: string;
	readonly models: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
/** Default model mirror: repo frontend/app/public/models (this file is at
 * frontend/packages/amlfilter-publisher/src/cli.ts). */
const DEFAULT_MODELS = resolve(HERE, "../../../app/public/models");

function parseArgs(argv: readonly string[]): CliArgs {
	const map = new Map<string, string>();
	for (let i = 0; i < argv.length; i += 2) {
		const flag = argv[i];
		const value = argv[i + 1];
		if (flag === undefined || !flag.startsWith("--") || value === undefined) {
			throw new Error(`malformed argument near "${flag ?? ""}"`);
		}
		map.set(flag.slice(2), value);
	}
	const required = ["in", "version", "key", "out"] as const;
	for (const k of required) {
		if (!map.has(k)) {
			throw new Error(`missing required --${k}`);
		}
	}
	return {
		in: map.get("in") as string,
		version: map.get("version") as string,
		key: map.get("key") as string,
		out: map.get("out") as string,
		models: map.get("models") ?? DEFAULT_MODELS,
	};
}

async function readKey(path: string): Promise<Uint8Array> {
	const bytes = new Uint8Array(await readFile(path));
	if (bytes.length !== 32) {
		throw new Error(
			`key file ${path} must be 32 raw bytes, got ${bytes.length}`,
		);
	}
	return bytes;
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const privateKey = await readKey(args.key);
	await publishWatchlist({
		entitiesJsonlPath: args.in,
		version: args.version,
		privateKey,
		outDir: args.out,
		embedder: createNodeEmbedder(args.models),
	});
	process.stdout.write(`published watchlist v${args.version} -> ${args.out}\n`);
}

main().catch((err: unknown) => {
	process.stderr.write(
		`amlfilter-publish: ${err instanceof Error ? err.message : String(err)}\n`,
	);
	process.exit(1);
});
