// Regenerate the DEMO-2 multi-list CATALOG e2e fixture under
// frontend/app/tests/e2e-kyc/fixtures/watchlist-v2-catalog/.
//
// This is the SECOND signed catalog the KYC e2e routes in on its "new publish"
// poll. It mirrors the committed boot catalog (buildDemoMultiList.ts → four
// per-list dirs ofac/, eu/, un/, uk/ + a signed catalog.json) but BUMPS the OFAC
// list to version "demo-2" while keeping EU/UN/UK at "demo-1". Because only one
// list advances, the engine's COMPOSITE version stamp changes (…|OFAC_SDN@demo-2|…
// ≠ …|OFAC_SDN@demo-1|…), so the running tab's manifest poll detects a real new
// publish, reloads + re-screens, and — because OFAC still carries "Ivan Fakovich"
// (alias "Vanya Fakovich") — the same entity still matches so a prior disposition
// carries forward across the reload.
//
// Output goes to a COMMITTED test fixture (NOT public/): the e2e serves it via
// page.route(), it must not be statically served as the boot catalog. The
// publisher is deterministic over (input, version, generatedAt, embedder), so
// generatedAt is FIXED for byte-stable, reproducible fixture files.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	buildCatalog,
	type CatalogList,
	writeSignedCatalog,
} from "./catalog.ts";
import { createNodeEmbedder } from "./nodeEmbedder.ts";
import { publishWatchlist } from "./publisher.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEMO = resolve(HERE, "../fixtures/demo");
const KEY = resolve(HERE, "../fixtures/demo.key");
const MODELS = resolve(HERE, "../../../app/public/models");
const OUT = resolve(
	HERE,
	"../../../app/tests/e2e-kyc/fixtures/watchlist-v2-catalog",
);

const DEMO_GENERATED_AT = "2026-06-19T00:00:00Z";

/** One list to publish: its catalog identity, demo JSONL slug, and version. */
interface DemoList {
	readonly id: string;
	readonly title: string;
	readonly slug: string;
	readonly version: string;
}

// Only OFAC advances to demo-2; the others stay at demo-1 (matching the boot
// catalog under app/public/watchlist/). That single bump moves the composite
// stamp and triggers the reload + re-screen.
const LISTS: readonly DemoList[] = [
	{ id: "OFAC_SDN", title: "OFAC SDN", slug: "ofac", version: "demo-2" },
	{
		id: "EU_CONSOLIDATED",
		title: "EU Consolidated",
		slug: "eu",
		version: "demo-1",
	},
	{
		id: "UN_CONSOLIDATED",
		title: "UN Consolidated",
		slug: "un",
		version: "demo-1",
	},
	{ id: "UK_OFSI", title: "UK OFSI", slug: "uk", version: "demo-1" },
];

async function publishOne(
	list: DemoList,
	privateKey: Uint8Array,
): Promise<CatalogList> {
	const manifest = await publishWatchlist({
		entitiesJsonlPath: resolve(DEMO, `${list.slug}.jsonl`),
		version: list.version,
		privateKey,
		outDir: resolve(OUT, list.slug),
		embedder: createNodeEmbedder(MODELS),
		generatedAt: DEMO_GENERATED_AT,
		listId: list.id,
	});
	return {
		id: list.id,
		title: list.title,
		version: manifest.version,
		entitiesCount: manifest.entitiesCount,
		path: `${list.slug}/`,
	};
}

async function main(): Promise<void> {
	const privateKey = new Uint8Array(await readFile(KEY));
	const entries: CatalogList[] = [];
	for (const list of LISTS) {
		entries.push(await publishOne(list, privateKey));
	}
	const catalog = buildCatalog(entries, DEMO_GENERATED_AT);
	await writeSignedCatalog(OUT, catalog, privateKey);
	process.stdout.write(
		`demo-2 catalog fixture (${entries.length} lists, OFAC@demo-2) -> ${OUT}\n`,
	);
}

main().catch((err: unknown) => {
	process.stderr.write(
		`build-demo-catalog-v2: ${err instanceof Error ? err.message : String(err)}\n`,
	);
	process.exit(1);
});
