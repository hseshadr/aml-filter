#!/usr/bin/env node
// amlfilter-publish — publish signed watchlist artifacts the browser tier syncs
// and verifies fail-closed. Two commands:
//
//   amlfilter-publish [publish] --in <jsonl> --version <v> --key <privkey-file> \
//                     --out <dir> [--models <dir>]
//       Single-list: publish one watchlist from a source-entities JSONL.
//
//   amlfilter-publish publish-catalog --version <v> --key <privkey-file> \
//                     --out <dir> [--models <dir>]
//       Multi-list: run each adapter's real fetchRaw(), publish the lists that
//       fetched to <out>/<slug>/, and write a signed catalog.json listing them.
//       A source whose fetchRaw is not wired yet (EU/UK) is logged and skipped.
//
// --key is a raw 32-byte Ed25519 seed file. --models is the directory that
// CONTAINS the Xenova/all-MiniLM-L6-v2/... layout (defaults to the repo's
// frontend/app/public/models). Fails loud on missing/invalid args.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createNodeEmbedder } from "./nodeEmbedder.ts";
import { type CatalogSourceSpec, publishCatalog } from "./publishCatalog.ts";
import { publishWatchlist } from "./publisher.ts";
import { euSource } from "./sources/euSource.ts";
import { ofacSource } from "./sources/ofacSource.ts";
import { ukSource } from "./sources/ukSource.ts";
import { unSource } from "./sources/unSource.ts";

interface CliArgs {
	readonly in?: string;
	readonly version: string;
	readonly key: string;
	readonly out: string;
	readonly models: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
/** Default model mirror: repo frontend/app/public/models (this file is at
 * frontend/packages/amlfilter-publisher/src/cli.ts). */
const DEFAULT_MODELS = resolve(HERE, "../../../app/public/models");

/** The production catalog sources, in catalog order. OFAC + UN have a real
 * fetchRaw today; EU + UK are scaffolded and will be logged-and-skipped until
 * their fetchRaw is wired — so the published catalog reflects what truly fetched. */
const CATALOG_SOURCES: readonly CatalogSourceSpec[] = [
	{ source: ofacSource, slug: "ofac" },
	{ source: unSource, slug: "un" },
	{ source: euSource, slug: "eu" },
	{ source: ukSource, slug: "uk" },
];

function parseArgs(
	argv: readonly string[],
	required: readonly string[],
): CliArgs {
	const map = new Map<string, string>();
	for (let i = 0; i < argv.length; i += 2) {
		const flag = argv[i];
		const value = argv[i + 1];
		if (flag === undefined || !flag.startsWith("--") || value === undefined) {
			throw new Error(`malformed argument near "${flag ?? ""}"`);
		}
		map.set(flag.slice(2), value);
	}
	for (const k of required) {
		if (!map.has(k)) {
			throw new Error(`missing required --${k}`);
		}
	}
	return {
		in: map.get("in"),
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

async function runPublish(argv: readonly string[]): Promise<void> {
	const args = parseArgs(argv, ["in", "version", "key", "out"]);
	const privateKey = await readKey(args.key);
	await publishWatchlist({
		entitiesJsonlPath: args.in as string,
		version: args.version,
		privateKey,
		outDir: args.out,
		embedder: createNodeEmbedder(args.models),
	});
	process.stdout.write(`published watchlist v${args.version} -> ${args.out}\n`);
}

async function runPublishCatalog(argv: readonly string[]): Promise<void> {
	const args = parseArgs(argv, ["version", "key", "out"]);
	const privateKey = await readKey(args.key);
	const published = await publishCatalog({
		sources: CATALOG_SOURCES,
		version: args.version,
		privateKey,
		outDir: args.out,
		embedder: createNodeEmbedder(args.models),
		log: (m) => process.stderr.write(`${m}\n`),
	});
	process.stdout.write(
		`published catalog v${args.version} (${published.length} lists: ${published.join(", ")}) -> ${args.out}\n`,
	);
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	if (argv[0] === "publish-catalog") {
		await runPublishCatalog(argv.slice(1));
		return;
	}
	await runPublish(argv[0] === "publish" ? argv.slice(1) : argv);
}

main().catch((err: unknown) => {
	process.stderr.write(
		`amlfilter-publish: ${err instanceof Error ? err.message : String(err)}\n`,
	);
	process.exit(1);
});
