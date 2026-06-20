// Regenerate the committed DEMO watchlist artifact.
//
// Runs the publisher over fixtures/demo_entities.jsonl with the demo key
// (fixtures/demo.key — a non-production key whose public half is the committed
// frontend/app/public/public.key) and the REAL Node embedder, writing the four
// files into frontend/app/public/watchlist/ so `vite preview` serves them
// same-origin for the C1 e2e. generatedAt is FIXED so the artifact is byte-stable.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createNodeEmbedder } from "./nodeEmbedder.ts";
import { publishWatchlist } from "./publisher.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, "../fixtures");
const MODELS = resolve(HERE, "../../../app/public/models");
const OUT = resolve(HERE, "../../../app/public/watchlist");

/** Fixed instant so the committed demo artifact is reproducible byte-for-byte. */
const DEMO_GENERATED_AT = "2026-06-19T00:00:00Z";
const DEMO_VERSION = "demo-1";

async function main(): Promise<void> {
	const privateKey = new Uint8Array(
		await readFile(resolve(FIXTURES, "demo.key")),
	);
	await publishWatchlist({
		entitiesJsonlPath: resolve(FIXTURES, "demo_entities.jsonl"),
		version: DEMO_VERSION,
		privateKey,
		outDir: OUT,
		embedder: createNodeEmbedder(MODELS),
		generatedAt: DEMO_GENERATED_AT,
		listId: "OFAC_SDN",
	});
	process.stdout.write(`demo watchlist (${DEMO_VERSION}) -> ${OUT}\n`);
}

main().catch((err: unknown) => {
	process.stderr.write(
		`build-demo: ${err instanceof Error ? err.message : String(err)}\n`,
	);
	process.exit(1);
});
