// Regenerate the committed MULTI-LIST demo (Theme A) under
// frontend/app/public/watchlist/.
//
// Produces, with the committed demo key + the real Node embedder, four per-list
// dirs (ofac/, eu/, un/, uk/) each with watchlist.json(.sig) +
// watchlist.manifest.json(.sig), plus a signed catalog.json(.sig) listing all
// four. The OFAC list keeps "Ivan Fakovich" (alias "Vanya Fakovich") so the
// existing screening e2e still finds it.
//
// The legacy FLAT watchlist/watchlist.json(.sig) + manifest stay in place
// (buildDemo.ts) until the browser wave migrates to the catalog — this script
// adds the per-list dirs + catalog ALONGSIDE them.
//
// generatedAt + version are FIXED so the artifact is byte-stable (the publisher
// is deterministic over (input, version, generatedAt, embedder)).

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
const OUT = resolve(HERE, "../../../app/public/watchlist");

const DEMO_GENERATED_AT = "2026-06-19T00:00:00Z";
const DEMO_VERSION = "demo-1";

/** One list to publish: its catalog identity + demo JSONL slug. */
interface DemoList {
	readonly id: string;
	readonly title: string;
	readonly slug: string;
}

const LISTS: readonly DemoList[] = [
	{ id: "OFAC_SDN", title: "OFAC SDN", slug: "ofac" },
	{ id: "EU_CONSOLIDATED", title: "EU Consolidated", slug: "eu" },
	{ id: "UN_CONSOLIDATED", title: "UN Consolidated", slug: "un" },
	{ id: "UK_OFSI", title: "UK OFSI", slug: "uk" },
];

async function publishOne(
	list: DemoList,
	privateKey: Uint8Array,
): Promise<CatalogList> {
	const manifest = await publishWatchlist({
		entitiesJsonlPath: resolve(DEMO, `${list.slug}.jsonl`),
		version: DEMO_VERSION,
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
		`multi-list demo (${entries.length} lists) + catalog -> ${OUT}\n`,
	);
}

main().catch((err: unknown) => {
	process.stderr.write(
		`build-demo-multilist: ${err instanceof Error ? err.message : String(err)}\n`,
	);
	process.exit(1);
});
