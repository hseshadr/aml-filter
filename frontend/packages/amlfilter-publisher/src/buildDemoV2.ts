// Regenerate the committed DEMO-2 e2e fixture watchlist artifact.
//
// This is the SECOND signed watchlist the KYC e2e routes in on its "new publish"
// poll: same fixtures + same demo key as buildDemo.ts, but with a BUMPED version
// ("demo-2"). Because the publisher is deterministic over (input, version,
// generatedAt, embedder), the entities + vectors are byte-identical to demo-1 —
// only the version string (and therefore the signatures) differ. That lets the
// e2e prove live new-publish detection end to end: the running engine loaded
// demo-1, the manifest poll now returns demo-2, the watchlist reloads + re-screens,
// and the same Ivan Fakovich entity still matches so a prior disposition carries
// forward across the reload.
//
// Output goes to frontend/app/tests/e2e-kyc/fixtures/watchlist-v2/ (a committed
// test fixture, NOT public/ — the e2e serves it via page.route(), it must not be
// statically served as the boot watchlist). generatedAt is FIXED for byte-stability.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createNodeEmbedder } from "./nodeEmbedder.ts";
import { publishWatchlist } from "./publisher.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, "../fixtures");
const MODELS = resolve(HERE, "../../../app/public/models");
const OUT = resolve(HERE, "../../../app/tests/e2e-kyc/fixtures/watchlist-v2");

/** Fixed instant so the committed fixture is reproducible byte-for-byte. */
const DEMO_GENERATED_AT = "2026-06-19T00:00:00Z";
const DEMO_VERSION = "demo-2";

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
	process.stdout.write(`demo e2e fixture (${DEMO_VERSION}) -> ${OUT}\n`);
}

main().catch((err: unknown) => {
	process.stderr.write(
		`build-demo-v2: ${err instanceof Error ? err.message : String(err)}\n`,
	);
	process.exit(1);
});
